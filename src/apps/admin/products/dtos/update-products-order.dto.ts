import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

export class UpdateProductsOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  orderedIds!: string[];
}
