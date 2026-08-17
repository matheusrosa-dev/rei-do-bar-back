import { Expose } from "class-transformer";

export class AuthDto {
  @Expose()
  deviceId?: string;

  @Expose()
  hasToInitAccount?: boolean;

  @Expose()
  accessToken?: string;

  @Expose()
  refreshToken?: string;
}
