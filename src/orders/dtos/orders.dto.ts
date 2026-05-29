import { PaymentType } from "@shared/database/prisma/generated/enums";
import { Expose, Type } from "class-transformer";

export class OrdersDto {
  @Expose()
  id!: string;

  @Expose()
  orderNumber!: number;

  @Expose()
  address!: string;

  @Expose()
  status!: string;

  @Expose()
  statusReason!: string | null;

  @Expose()
  deliveryFee!: number;

  @Expose()
  subtotal!: number;

  @Expose()
  total!: number;

  @Expose()
  paymentType!: PaymentType;

  @Expose()
  createdAt!: Date;

  @Expose()
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

class OrderItemDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  imageUrl!: string;

  @Expose()
  quantity!: number;

  @Expose()
  price!: number;
}
