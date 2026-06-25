import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { InventoryOrigin } from "@shared/database/prisma/generated/enums";
import { OrderCreatedEvent } from "@shared/events/order";
import { OrderCancelledEvent } from "@shared/events/order/order-cancelled.event";

@Injectable()
export class AdminInventoryListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(OrderCreatedEvent.NAME)
  async createDecrementedInventory({ data }: OrderCreatedEvent) {
    const { order } = data;

    await this.prisma.inventory.create({
      data: {
        orderId: order.id,
        origin: InventoryOrigin.ORDER_CREATION,
        products: {
          createMany: {
            data: order.items.map((item) => ({
              price: item.price,
              productId: item.productId,
              quantity: -item.quantity,
            })),
          },
        },
      },
    });
  }

  @OnEvent(OrderCancelledEvent.NAME)
  async createIncrementedInventory({ data }: OrderCancelledEvent) {
    const { order } = data;

    await this.prisma.inventory.create({
      data: {
        orderId: order.id,
        origin: InventoryOrigin.ORDER_CANCELLATION,
        products: {
          createMany: {
            data: order.items.map((item) => ({
              price: item.price,
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      },
    });
  }
}
