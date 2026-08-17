import { IsUUID } from "class-validator";

export class ToggleStatusCustomerDto {
  @IsUUID()
  customerId: string;
}
