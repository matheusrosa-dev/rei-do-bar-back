import { Expose, Type } from "class-transformer";

export class MeDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string | null;

  @Expose()
  phone!: string;

  @Expose()
  createdAt!: Date;

  @Expose()
  @Type(() => AddressDto)
  addresses?: AddressDto[];
}

class AddressDto {
  @Expose()
  id!: string;

  @Expose()
  street!: string;

  @Expose()
  number!: string;

  @Expose()
  isMain!: boolean;

  @Expose()
  complement?: string;

  @Expose()
  neighborhood!: string;

  @Expose()
  zipCode!: string;

  @Expose()
  createdAt!: Date;
}
