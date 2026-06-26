import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { InventoryMovementOrigin } from "@shared/database/prisma/generated/enums";
import { OrderCreatedEvent } from "@shared/events/order";
import { OrderCancelledEvent } from "@shared/events/order/order-cancelled.event";
import { Order, OrderItem } from "@shared/database/prisma/generated/client";

type PartialOrder = Pick<
  Order,
  "id" | "customerId" | "orderNumber" | "status" | "statusReason"
>;

type PartialOrderItem = Pick<OrderItem, "price" | "productId" | "quantity">;

@Injectable()
export class AdminInventoryListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(OrderCreatedEvent.NAME)
  async onOrderCreated({ data }: OrderCreatedEvent) {
    const { order } = data;

    await this.registerInventoryMovement({
      order,
      origin: InventoryMovementOrigin.ORDER_CREATION,
    });
  }

  @OnEvent(OrderCancelledEvent.NAME)
  async onOrderCancelled({ data }: OrderCancelledEvent) {
    const { order, origin } = data;

    await this.registerInventoryMovement({
      order,
      origin,
    });
  }

  private async registerInventoryMovement(props: {
    origin: InventoryMovementOrigin;
    order: PartialOrder & {
      items: Array<PartialOrderItem>;
    };
  }) {
    const { order, origin } = props;

    await this.prisma.inventoryMovement.create({
      data: {
        orderId: order.id,
        origin,
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
