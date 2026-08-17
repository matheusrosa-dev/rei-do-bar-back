import { IsOptional, IsUUID } from "class-validator";

export class SyncDeviceIdDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
