import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class UpdateCategoryBodyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  pluralName: string;
}

export class UpdateCategoryParamsDto {
  @IsUUID()
  categoryId: string;
}
