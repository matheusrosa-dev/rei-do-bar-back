import { IsNotEmpty, IsString, IsUrl } from "class-validator";

export class CreateCategoryGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl()
  allProductsImageUrl!: string;

  @IsUrl()
  promotionsImageUrl!: string;
}
