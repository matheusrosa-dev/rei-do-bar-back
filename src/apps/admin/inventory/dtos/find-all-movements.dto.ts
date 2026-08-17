import { InventoryMovementOrigin } from "@shared/database/prisma/generated/enums";
import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

const toArray = (value: unknown) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
};

export class FindAllMovementsDto {
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsEnum(InventoryMovementOrigin, { each: true })
  origin?: InventoryMovementOrigin[];

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsUUID("4", { each: true })
  productIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
