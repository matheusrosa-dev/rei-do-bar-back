import {
  InventoryMovementOrigin,
  Order,
  OrderItem,
} from "@shared/database/prisma/generated/client";

type PartialOrder = Pick<
  Order,
  "id" | "customerId" | "orderNumber" | "status" | "statusReason"
>;

type PartialOrderItem = Pick<OrderItem, "price" | "productId" | "quantity">;

export class OrderCancelledEvent {
  static NAME = "order.cancelled";

  constructor(
    public data: {
      origin: InventoryMovementOrigin;
      order: PartialOrder & {
        items: Array<PartialOrderItem>;
      };
    },
  ) {}
}
