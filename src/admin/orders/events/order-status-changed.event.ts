import { Order } from "@shared/database/prisma/generated/client";

export class OrderStatusChangedEvent {
  constructor(
    public data: {
      order: Pick<
        Order,
        "id" | "customerId" | "orderNumber" | "status" | "statusReason"
      >;
    },
  ) {}
}
