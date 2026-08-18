import { IsUUID } from "class-validator";

export class DeliverOrderParamsDto {
  @IsUUID()
  orderId!: string;
}
