import { HttpStatus, Injectable } from "@nestjs/common";
import {
  Order,
  OrderItem,
  Product,
} from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindAllOrdersDto, UpdateOrderStatusBodyDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

type OrderWithItems = Order & {
  items: Array<OrderItem & { product: Product }>;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
          createdAt: "desc",
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      }),
      this.prisma.order.count(),
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
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    });

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
