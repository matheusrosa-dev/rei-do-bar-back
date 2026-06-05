import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from "class-validator";

export class UpdateProductParamsDto {
  @IsUUID()
  productId: string;
}

export class UpdateProductBodyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsNumber()
  @IsInt()
  price: number;

  @IsString()
  @IsUrl()
  imageUrl: string;

  @IsUUID()
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
