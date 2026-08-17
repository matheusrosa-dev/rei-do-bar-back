import { IsUUID } from "class-validator";

export class DeleteProductDto {
  @IsUUID()
  productId: string;
}
