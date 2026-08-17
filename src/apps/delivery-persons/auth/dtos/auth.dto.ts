import { Expose } from "class-transformer";

export class DeliveryPersonsAuthDto {
  @Expose()
  accessToken!: string;

  @Expose()
  refreshToken!: string;
}
