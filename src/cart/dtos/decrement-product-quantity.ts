import { IsUUID } from "class-validator";

export class DecrementProductQuantityDto {
  @IsUUID()
  productId!: string;
}
