import { PaymentType } from "@shared/database/prisma/generated/enums";
import { Expose, Type } from "class-transformer";

export class DeliveryPersonsOrdersDto {
  @Expose()
  id!: string;

  @Expose()
  orderNumber!: number;

  @Expose()
  address!: string;

  @Expose()
  total!: number;

  @Expose()
  paymentType!: PaymentType;

  @Expose()
  @Type(() => DeliveryPersonsOrderItemDto)
  items!: DeliveryPersonsOrderItemDto[];

  @Expose()
  deliveredCount!: number;
}

class DeliveryPersonsOrderItemDto {
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
