import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class ProductOrderItemDto {
  @IsUUID("4")
  productId!: string;
}

export class ProductsGroupOrderItemDto {
  @IsUUID("4")
  categoryGroupId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOrderItemDto)
  products!: ProductOrderItemDto[];
}

export class UpdateProductsOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProductsGroupOrderItemDto)
  categoryGroups!: ProductsGroupOrderItemDto[];
}
