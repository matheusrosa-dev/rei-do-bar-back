import { Order, OrderItem } from "@shared/database/prisma/generated/client";

type PartialOrder = Pick<
  Order,
  "id" | "customerId" | "orderNumber" | "status" | "statusReason"
>;

type PartialOrderItem = Pick<OrderItem, "price" | "productId" | "quantity">;

export class OrderCreatedEvent {
  static NAME = "order.created";

  constructor(
    public data: {
      order: PartialOrder & {
        items: Array<PartialOrderItem>;
      };
    },
  ) {}
}
