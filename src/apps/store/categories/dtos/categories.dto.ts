import { Expose } from "class-transformer";

export class CategoriesDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  pluralName!: string;

  @Expose()
  imageUrl!: string;
}
