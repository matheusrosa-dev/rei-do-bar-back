import { Expose } from "class-transformer";

export class CategoriesDto {
  @Expose()
  id!: number;

  @Expose()
  name!: string;

  @Expose()
  pluralName!: string;
}
