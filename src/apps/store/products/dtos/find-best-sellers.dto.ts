import { IsOptional, IsString } from "class-validator";

export class FindBestSellersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  searchTerm?: string;
}
