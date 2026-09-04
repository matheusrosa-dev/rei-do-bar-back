import { IsUUID } from "class-validator";

export class ReorderDto {
  @IsUUID()
  orderId!: string;
}
