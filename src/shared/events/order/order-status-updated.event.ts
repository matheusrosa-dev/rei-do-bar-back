import { Order } from "@shared/database/prisma/generated/client";

export class OrderStatusUpdatedEvent {
  static NAME = "order.status-updated";

  constructor(
    public data: {
      order: Pick<
        Order,
        "id" | "customerId" | "orderNumber" | "status" | "statusReason"
      >;
    },
  ) {}
}
