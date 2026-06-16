import { Expose, Type } from "class-transformer";

export class CartDto {
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
  quantity!: number;

  @Expose()
  deliveryFee!: number;

  @Expose()
  minOrderValue!: number;

  @Expose()
  subtotal!: number;

  @Expose()
  productsCount!: number;

  @Expose()
  total!: number;

  @Expose()
  @Type(() => CartItemDto)
  products!: CartItemDto[];
}

class CartItemDto {
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
  quantity!: number;

  @Expose()
  remainingStock!: number | null;
}
