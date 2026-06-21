import { IsNotEmpty, IsString, IsUrl, IsUUID } from "class-validator";

export class UpdateCategoryBodyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  pluralName!: string;

  @IsUrl()
  imageUrl!: string;
}

export class UpdateCategoryParamsDto {
  @IsUUID()
  categoryId!: string;
}
