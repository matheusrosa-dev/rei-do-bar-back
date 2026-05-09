import { Expose } from "class-transformer";

export class ProductsDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  description!: string;

  @Expose()
  price!: number;

  @Expose()
  imageUrl!: string;

  @Expose()
  quantityInCart!: number;

  @Expose()
  remainingStock!: number | null;
}
