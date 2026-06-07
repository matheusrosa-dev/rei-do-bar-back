import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class FindAllCategory {
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  isActive?: boolean;
}
