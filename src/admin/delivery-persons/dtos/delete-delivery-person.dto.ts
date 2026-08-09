import { IsUUID } from "class-validator";

export class DeleteDeliveryPersonDto {
  @IsUUID()
  deliveryPersonId!: string;
}
