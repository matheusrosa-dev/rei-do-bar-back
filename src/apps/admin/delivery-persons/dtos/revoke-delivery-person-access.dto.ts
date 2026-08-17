import { IsUUID } from "class-validator";

export class RevokeDeliveryPersonAccessDto {
  @IsUUID()
  deliveryPersonId!: string;
}
