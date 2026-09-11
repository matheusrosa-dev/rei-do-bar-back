import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class FindAllProductsDto {
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  simple?: boolean = false;
}
