import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class FindAllDeliveryPersonsDto {
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
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  searchTerm?: string;
}
