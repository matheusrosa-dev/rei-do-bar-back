import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  ValidateNested,
} from "class-validator";

class MovementProductDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class DecrementInventoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MovementProductDto)
  movementProducts!: MovementProductDto[];
}
