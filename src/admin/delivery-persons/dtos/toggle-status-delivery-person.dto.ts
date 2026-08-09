import { IsUUID } from "class-validator";

export class ToggleStatusDeliveryPersonDto {
  @IsUUID()
  deliveryPersonId!: string;
}
