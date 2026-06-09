import { IsUUID } from "class-validator";

export class DeleteCustomerDto {
  @IsUUID()
  customerId: string;
}
