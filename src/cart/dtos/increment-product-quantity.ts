import { IsUUID } from "class-validator";

export class IncrementProductQuantityDto {
  @IsUUID()
  productId!: string;
}
