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

class MovementProductDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsInt()
  @Min(1)
  price!: number;
}

export class IncrementInventoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MovementProductDto)
  movementProducts!: MovementProductDto[];
}
