import { HttpStatus, Injectable } from "@nestjs/common";
import { Order, Prisma } from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { OrderOrderByWithRelationInput } from "@shared/database/prisma/generated/models";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindAllOrdersDto, UpdateOrderStatusBodyDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { OrderStatusChangedEvent } from "./events";
import {
  ORDER_STATUS_TRANSITIONS,
  OrderSortValueSource,
  OrderWithItems,
} from "./helpers";

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listOrdersManagement() {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const [ongoingOrders, completedOrders] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: {
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PREPARING,
              OrderStatus.SHIPPED,
            ],
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      this.prisma.order.findMany({
        where: {
          status: {
            in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
          },
          updatedAt: {
            gte: fourHoursAgo,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
        take: 30,
      }),
    ]);

    const formattedOngoingOrders = this.calculateOrdersTotals(ongoingOrders);
    const formattedCompletedOrders =
      this.calculateOrdersTotals(completedOrders);

    const ordersByStatus = {
      [OrderStatus.PENDING]: this.filterOrdersByStatus(
        formattedOngoingOrders,
        OrderStatus.PENDING,
      ),
      [OrderStatus.PREPARING]: this.filterOrdersByStatus(
        formattedOngoingOrders,
        OrderStatus.PREPARING,
      ),
      [OrderStatus.SHIPPED]: this.filterOrdersByStatus(
        formattedOngoingOrders,
        OrderStatus.SHIPPED,
      ),
      [OrderStatus.DELIVERED]: this.filterOrdersByStatus(
        formattedCompletedOrders,
        OrderStatus.DELIVERED,
      ),
      [OrderStatus.CANCELLED]: this.filterOrdersByStatus(
        formattedCompletedOrders,
        OrderStatus.CANCELLED,
      ),
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

    const orderBy: OrderOrderByWithRelationInput = dto.sortKey
      ? { [dto.sortKey]: direction }
      : { createdAt: "desc" };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
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
    const allOrders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        deliveryFee: true,
        items: {
          select: {
            price: true,
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
        items: {
          include: {
            product: true,
          },
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

    const subtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return subtotal + order.deliveryFee;
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
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_ALREADY_FINALIZED,
        "Pedido já finalizado.",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.canMoveOrder(order.status, dto.status)) {
      throw new AppException(
        AppException.errorCodes.adminOrders.ORDER_INVALID_STATUS_TRANSITION,
        "Transição de status inválida.",
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: {
          id: orderId,
          status: order.status,
        },
        data: {
          status: dto.status,
          ...(dto.status === OrderStatus.CANCELLED && {
            statusReason: dto.statusReason,
          }),
        },
      });

      if (result.count === 0) {
        throw new AppException(
          AppException.errorCodes.adminOrders.ORDER_INVALID_STATUS_TRANSITION,
          "O status do pedido mudou. Recarregue e tente novamente.",
          HttpStatus.BAD_REQUEST,
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

    this.eventEmitter.emit(
      OrderStatusChangedEvent.name,
      new OrderStatusChangedEvent({
        ...order,
        status: dto.status,
        statusReason: dto?.statusReason ?? null,
      }),
    );

    return this.listOrdersManagement();
  }

  private calculateOrdersTotals(orders: OrderWithItems[]) {
    return orders.map((order) => {
      const subtotal = order.items.reduce((sum, item) => {
        return sum + item.price * item.quantity;
      }, 0);

      const total = subtotal + order.deliveryFee;

      return {
        ...order,
        subtotal,
        total,
      };
    });
  }

  private canMoveOrder(from: OrderStatus, to: OrderStatus) {
    return ORDER_STATUS_TRANSITIONS[from].includes(to);
  }

  private filterOrdersByStatus(orders: Order[], status: OrderStatus) {
    return orders.filter((order) => order.status === status);
  }
}
