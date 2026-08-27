import { Injectable } from "@nestjs/common";
import { Order, Prisma } from "@shared/database/prisma/generated/client";
import {
  InventoryMovementOrigin,
  OrderStatus,
} from "@shared/database/prisma/generated/enums";
import { OrderOrderByWithRelationInput } from "@shared/database/prisma/generated/models";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  FindAllOrdersDto,
  UpdateOrderDeliveryPersonBodyDto,
  UpdateOrderStatusBodyDto,
} from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getRecentOrdersWindowStart } from "@shared/helpers/orders-window";
import { isForeignKeyConstraintViolation } from "@shared/helpers/prisma-errors";
import {
  ORDER_STATUS_TRANSITIONS,
  OrderSortValueSource,
  OrderWithItems,
} from "./helpers";
import {
  OrderCancelledEvent,
  OrderStatusUpdatedEvent,
} from "@shared/events/order";
import { computeOrderTotals } from "@shared/helpers/products-totals";

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listOrdersManagement() {
    const windowStart = getRecentOrdersWindowStart();

    const include = {
      customer: true,
      deliveryPerson: true,
      items: {
        include: {
          product: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    } satisfies Prisma.OrderInclude;

    const [ongoingOrders, shippedOrders, deliveredOrders, cancelledOrders] =
      await this.prisma.$transaction([
        this.prisma.order.findMany({
          where: {
            status: {
              in: [OrderStatus.PENDING, OrderStatus.PREPARING],
            },
          },
          include,
          orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
        }),
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.SHIPPED,
          },
          include,
          orderBy: [
            { shippedAt: { sort: "asc", nulls: "first" } },
            { orderNumber: "asc" },
          ],
        }),
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.DELIVERED,
            deliveredAt: {
              gte: windowStart,
            },
          },
          orderBy: [{ deliveredAt: "desc" }, { orderNumber: "desc" }],
          include,
          take: 30,
        }),
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.CANCELLED,
            cancelledAt: {
              gte: windowStart,
            },
          },
          orderBy: [{ cancelledAt: "desc" }, { orderNumber: "desc" }],
          include,
          take: 30,
        }),
      ]);

    const formattedOngoingOrders = this.calculateOrdersTotals(ongoingOrders);

    const ordersByStatus = {
      [OrderStatus.PENDING]: this.filterOrdersByStatus(
        formattedOngoingOrders,
        OrderStatus.PENDING,
      ),
      [OrderStatus.PREPARING]: this.filterOrdersByStatus(
        formattedOngoingOrders,
        OrderStatus.PREPARING,
      ),
      [OrderStatus.SHIPPED]: this.calculateOrdersTotals(shippedOrders),
      [OrderStatus.DELIVERED]: this.calculateOrdersTotals(deliveredOrders),
      [OrderStatus.CANCELLED]: this.calculateOrdersTotals(cancelledOrders),
    };

    return ordersByStatus;
  }

  async findAll(dto: FindAllOrdersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const direction = dto.sortDirection ?? "desc";

    const searchTerm = dto.searchTerm?.trim();
    const orderNumber = Number(searchTerm);
    const isOrderNumberSearch =
      Number.isInteger(orderNumber) && orderNumber > 0;

    const where: Prisma.OrderWhereInput = {
      ...(dto.status && { status: dto.status }),
      ...(dto.paymentType && { paymentType: dto.paymentType }),
      ...(searchTerm && {
        OR: [
          { customer: { name: { contains: searchTerm, mode: "insensitive" } } },
          ...(isOrderNumberSearch ? [{ orderNumber }] : []),
        ],
      }),
    };

    if (dto.sortKey === "total" || dto.sortKey === "itemsQuantity") {
      return this.findAllSortedInMemory(
        dto.sortKey,
        where,
        page,
        limit,
        skip,
        direction,
      );
    }

    const orderBy: OrderOrderByWithRelationInput[] = [
      dto.sortKey ? { [dto.sortKey]: direction } : { createdAt: "desc" },
      { orderNumber: "desc" },
    ];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: true,
          deliveryPerson: true,
          items: {
            include: {
              product: true,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: this.calculateOrdersTotals(items),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async findAllSortedInMemory(
    sortKey: "total" | "itemsQuantity",
    where: Prisma.OrderWhereInput,
    page: number,
    limit: number,
    skip: number,
    direction: "asc" | "desc",
  ) {
    // O `orderBy` não é redundante com a ordenação em memória: sem ele o
    // Postgres não garante ordem alguma, e como o `sort` é estável os empates
    // — enormes no caso de `itemsQuantity`, já que a maioria dos pedidos
    // compartilha a mesma — seriam fatiados de forma diferente a cada página,
    // duplicando ou omitindo pedidos ao longo da paginação.
    const allOrders = await this.prisma.order.findMany({
      where,
      orderBy: { orderNumber: "desc" },
      select: {
        id: true,
        deliveryFee: true,
        couponDiscount: true,
        items: {
          select: {
            price: true,
            compareAtPrice: true,
            quantity: true,
          },
        },
      },
    });

    const ordersWithValue = allOrders.map((order) => ({
      id: order.id,
      value: this.computeSortValue(sortKey, order),
    }));

    ordersWithValue.sort((a, b) => {
      const diff = a.value - b.value;
      return direction === "asc" ? diff : -diff;
    });

    const total = ordersWithValue.length;
    const paginatedIds = ordersWithValue
      .slice(skip, skip + limit)
      .map((order) => order.id);

    if (paginatedIds.length === 0) {
      return {
        items: [],
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    const items = await this.prisma.order.findMany({
      where: { id: { in: paginatedIds } },
      include: {
        customer: true,
        deliveryPerson: true,
        items: {
          include: {
            product: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const sortedItems = paginatedIds.map((id) => itemMap.get(id)!);

    return {
      items: this.calculateOrdersTotals(sortedItems),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private computeSortValue(
    sortKey: "total" | "itemsQuantity",
    order: OrderSortValueSource,
  ) {
    if (sortKey === "itemsQuantity") {
      return order.items.reduce((sum, item) => sum + item.quantity, 0);
    }

    return computeOrderTotals(order).total;
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusBodyDto) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_NOT_FOUND,
        "Pedido não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_ALREADY_FINALIZED,
        "Pedido já finalizado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.canMoveOrder(order.status, dto.status)) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_INVALID_STATUS_TRANSITION,
        "Transição de status inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.status === OrderStatus.SHIPPED) {
          await this.assertDeliveryPersonIsAssignable(
            tx,
            dto.deliveryPersonId!,
          );
        }

        const result = await tx.order.updateMany({
          where: {
            id: orderId,
            status: order.status,
          },
          data: {
            status: dto.status,
            ...(dto.status === OrderStatus.CANCELLED && {
              statusReason: dto.statusReason,
              cancelledAt: new Date(),
            }),
            ...(dto.status === OrderStatus.SHIPPED && {
              deliveryPersonId: dto.deliveryPersonId,
              shippedAt: new Date(),
            }),
            ...(dto.status === OrderStatus.DELIVERED && {
              deliveredAt: new Date(),
            }),
          },
        });

        if (result.count === 0) {
          throw new AppException(
            AppException.errorCodes.adminOrders.ORDER_INVALID_STATUS_TRANSITION,
            "O status do pedido mudou. Recarregue e tente novamente.",
            AppException.HttpStatus.BAD_REQUEST,
          );
        }

        if (dto.status === OrderStatus.CANCELLED) {
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stockQuantity: { increment: item.quantity } },
            });
          }
        }
      });
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_NOT_FOUND,
          "Entregador não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }

    this.eventEmitter.emit(
      OrderStatusUpdatedEvent.NAME,
      new OrderStatusUpdatedEvent({
        order: {
          ...order,
          status: dto.status,
          statusReason: dto?.statusReason ?? null,
        },
      }),
    );

    if (dto.status === OrderStatus.CANCELLED) {
      this.eventEmitter.emit(
        OrderCancelledEvent.NAME,
        new OrderCancelledEvent({
          origin: InventoryMovementOrigin.ADMIN_ORDER_CANCELLATION,
          order,
        }),
      );
    }

    return this.listOrdersManagement();
  }

  async updateOrderDeliveryPerson(
    orderId: string,
    dto: UpdateOrderDeliveryPersonBodyDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    if (!order) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_NOT_FOUND,
        "Pedido não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (
      order.status !== OrderStatus.SHIPPED &&
      order.status !== OrderStatus.CANCELLED &&
      order.status !== OrderStatus.DELIVERED
    ) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_NOT_SHIPPED,
        "Pedido ainda não saiu para entrega.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertDeliveryPersonIsAssignable(tx, dto.deliveryPersonId);

        const result = await tx.order.updateMany({
          where: {
            id: orderId,
            status: order.status,
          },
          data: {
            deliveryPersonId: dto.deliveryPersonId,
          },
        });

        if (result.count === 0) {
          throw new AppException(
            AppException.errorCodes.adminOrders.ORDER_INVALID_STATUS_TRANSITION,
            "O status do pedido mudou. Recarregue e tente novamente.",
            AppException.HttpStatus.BAD_REQUEST,
          );
        }
      });
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_NOT_FOUND,
          "Entregador não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }

    const updatedOrder = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        customer: true,
        deliveryPerson: true,
        items: {
          include: {
            product: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    return {
      ...updatedOrder!,
      ...computeOrderTotals(updatedOrder!),
    };
  }

  private async assertDeliveryPersonIsAssignable(
    tx: Prisma.TransactionClient,
    deliveryPersonId: string,
  ) {
    // Bloqueia a linha do entregador para serializar contra a exclusão
    // concorrente (admin/delivery-persons), que trava a mesma linha antes de
    // apagá-la.
    await tx.$queryRaw`SELECT id FROM delivery_persons WHERE id = ${deliveryPersonId} FOR UPDATE`;

    const deliveryPerson = await tx.deliveryPerson.findUnique({
      where: { id: deliveryPersonId },
      select: { isActive: true },
    });

    if (!deliveryPerson) {
      throw new AppException(
        AppException.errorCodes.adminDeliveryPersons.DELIVERY_PERSON_NOT_FOUND,
        "Entregador não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (!deliveryPerson.isActive) {
      throw new AppException(
        AppException.errorCodes.adminDeliveryPersons.DELIVERY_PERSON_INACTIVE,
        "Entregador inativo.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private calculateOrdersTotals<T extends OrderWithItems>(orders: T[]) {
    return orders.map((order) => ({
      ...order,
      ...computeOrderTotals(order),
    }));
  }

  private canMoveOrder(from: OrderStatus, to: OrderStatus) {
    return ORDER_STATUS_TRANSITIONS[from].includes(to);
  }

  private filterOrdersByStatus<T extends Pick<Order, "status">>(
    orders: T[],
    status: OrderStatus,
  ) {
    return orders.filter((order) => order.status === status);
  }
}
