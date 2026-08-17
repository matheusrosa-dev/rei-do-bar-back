import { Transform } from "class-transformer";
import { Contains, IsOptional, IsString, Length } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @Length(4, 80)
  @Contains(" ", { message: "name must contain first and last name" })
  name?: string;
}
