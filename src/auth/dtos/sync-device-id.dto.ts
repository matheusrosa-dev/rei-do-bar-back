import { IsOptional, IsString } from "class-validator";

export class SyncDeviceIdDto {
  @IsOptional()
  @IsString()
  deviceId?: string;
}
