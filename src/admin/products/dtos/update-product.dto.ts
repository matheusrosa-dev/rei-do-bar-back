import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from "class-validator";

export class UpdateProductParamsDto {
  @IsUUID()
  productId!: string;
}

export class UpdateProductBodyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsInt()
  price!: number;

  @IsOptional()
  @IsInt()
  compareAtPrice?: number;

  @IsUrl()
  imageUrl!: string;

  @IsUUID()
  categoryId!: string;
}
