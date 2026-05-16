import { Expose } from "class-transformer";

export class MeDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string | null;

  @Expose()
  phone!: string;

  @Expose()
  createdAt!: Date;
}
