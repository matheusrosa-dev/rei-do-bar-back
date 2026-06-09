import { IsUUID } from "class-validator";

export class FindCustomerByIdDto {
  @IsUUID()
  customerId!: string;
}
