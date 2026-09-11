import { IsNotEmpty, IsString, IsUrl, IsUUID } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  pluralName!: string;

  @IsUrl()
  imageUrl!: string;

  @IsUUID()
  categoryGroupId!: string;
}
