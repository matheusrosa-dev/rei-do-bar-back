import { IsUUID } from "class-validator";

export class UpdateOrderDeliveryPersonParamsDto {
  @IsUUID()
  orderId!: string;
}

export class UpdateOrderDeliveryPersonBodyDto {
  @IsUUID()
  deliveryPersonId!: string;
}
