import { IsNotEmpty, IsString, IsUrl, IsUUID } from "class-validator";

export class UpdateCategoryGroupBodyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl()
  allProductsImageUrl!: string;

  @IsUrl()
  promotionsImageUrl!: string;
}

export class UpdateCategoryGroupParamsDto {
  @IsUUID()
  categoryGroupId!: string;
}
