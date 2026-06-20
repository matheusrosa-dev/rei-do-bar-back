import { Order } from "@shared/database/prisma/generated/client";

export class OrderStatusChangedEvent {
  constructor(
    public order: Pick<
      Order,
      "id" | "customerId" | "orderNumber" | "status" | "statusReason"
    >,
  ) {}
}
