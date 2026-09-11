import { Expose, Type } from "class-transformer";

class Product {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  description!: string;

  @Expose()
  price!: number;

  @Expose()
  compareAtPrice!: number;

  @Expose()
  imageUrl!: string;

  @Expose()
  quantityInCart!: number;

  @Expose()
  remainingStock!: number | null;
}

export class ProductsDto extends Product {
  @Expose()
  @Type(() => Category)
  categories!: Category[];
}

class Category {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  pluralName!: string;

  @Expose()
  imageUrl!: string;

  @Expose()
  @Type(() => Product)
  products!: Product[];
}
