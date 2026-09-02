import { IsUUID } from "class-validator";

export class ToggleVolunteerDeliveryPersonDto {
  @IsUUID()
  deliveryPersonId!: string;
}
