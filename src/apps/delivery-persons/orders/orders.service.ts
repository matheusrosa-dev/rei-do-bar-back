import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { OrderStatusUpdatedEvent } from "@shared/events/order";
import { AppException } from "@shared/exceptions/app.exception";
import { computeOrderTotals } from "@shared/helpers/products-totals";

@Injectable()
export class DeliveryPersonsOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findShippedOrders(deliveryPersonId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryPersonId,
        status: OrderStatus.SHIPPED,
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return orders.map((order) => ({
      ...order,
      ...computeOrderTotals(order),
    }));
  }

  async markOrderAsDelivered(deliveryPersonId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryPersonId,
      },
    });

    if (!order) {
      throw new AppException(
        AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_FOUND,
        "Pedido não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (order.status !== OrderStatus.SHIPPED) {
      throw new AppException(
        AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_SHIPPED,
        "Este pedido não está saindo para entrega.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        deliveryPersonId,
        status: OrderStatus.SHIPPED,
      },
      data: {
        status: OrderStatus.DELIVERED,
      },
    });

    if (result.count === 0) {
      throw new AppException(
        AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_SHIPPED,
        "O status do pedido mudou. Recarregue e tente novamente.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    this.eventEmitter.emit(
      OrderStatusUpdatedEvent.NAME,
      new OrderStatusUpdatedEvent({
        order: {
          ...order,
          status: OrderStatus.DELIVERED,
        },
      }),
    );
  }
}
