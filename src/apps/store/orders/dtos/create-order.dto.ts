import { PaymentType } from "@shared/database/prisma/generated/enums";
import { IsEnum } from "class-validator";

export class CreateOrderDto {
  @IsEnum(PaymentType)
  paymentType!: PaymentType;
}
