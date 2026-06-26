import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class FindAllProductsDto {
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  simple?: boolean = false;

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

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsIn(["stockQuantity"])
  sortKey?: "stockQuantity";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc";
}
