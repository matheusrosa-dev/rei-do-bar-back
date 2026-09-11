import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class CategoryOrderItemDto {
  @IsUUID("4")
  categoryId!: string;
}

export class CategoryGroupOrderItemDto {
  @IsUUID("4")
  categoryGroupId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryOrderItemDto)
  categories!: CategoryOrderItemDto[];
}

export class UpdateCategoryGroupsOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CategoryGroupOrderItemDto)
  categoryGroups!: CategoryGroupOrderItemDto[];
}
