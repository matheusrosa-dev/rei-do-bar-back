import { IsUUID } from "class-validator";

export class FindDeliveryPersonByIdDto {
  @IsUUID()
  deliveryPersonId!: string;
}
