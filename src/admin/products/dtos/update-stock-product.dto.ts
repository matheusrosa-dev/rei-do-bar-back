import { IsNumber, IsPositive, IsUUID, Min } from "class-validator";

export class UpdateStockProductParamsDto {
  @IsUUID()
  productId: string;
}

export class UpdateStockProductBodyDto {
  @IsNumber()
  @Min(1)
  @IsPositive()
  amount: number;
}
