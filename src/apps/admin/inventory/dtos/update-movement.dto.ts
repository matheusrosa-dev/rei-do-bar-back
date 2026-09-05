import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, ValidateNested } from "class-validator";

import { RestockMovementProductDto } from "./increment-inventory.dto";

export class UpdateMovementBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RestockMovementProductDto)
  movementProducts!: RestockMovementProductDto[];
}
