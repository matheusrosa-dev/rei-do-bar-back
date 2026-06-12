import { HttpStatus, Injectable } from "@nestjs/common";
import { Order } from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { UpdateOrderStatusBodyDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
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

    const ordersByStatus = {
      [OrderStatus.PENDING]: this.filterOrdersByStatus(
        ongoingOrders,
        OrderStatus.PENDING,
      ),
      [OrderStatus.PREPARING]: this.filterOrdersByStatus(
        ongoingOrders,
        OrderStatus.PREPARING,
      ),
      [OrderStatus.SHIPPED]: this.filterOrdersByStatus(
        ongoingOrders,
        OrderStatus.SHIPPED,
      ),
      [OrderStatus.DELIVERED]: this.filterOrdersByStatus(
        completedOrders,
        OrderStatus.DELIVERED,
      ),
      [OrderStatus.CANCELLED]: this.filterOrdersByStatus(
        completedOrders,
        OrderStatus.CANCELLED,
      ),
    };

    return ordersByStatus;
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

  private canMoveOrder(from: OrderStatus, to: OrderStatus) {
    return ORDER_STATUS_TRANSITIONS[from].includes(to);
  }

  private filterOrdersByStatus(orders: Order[], status: OrderStatus) {
    return orders.filter((order) => order.status === status);
  }
}
