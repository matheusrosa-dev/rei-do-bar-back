import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class RestockMovementProductDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsInt()
  @Min(1)
  totalCost!: number;
}

export class IncrementInventoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RestockMovementProductDto)
  movementProducts!: RestockMovementProductDto[];
}
