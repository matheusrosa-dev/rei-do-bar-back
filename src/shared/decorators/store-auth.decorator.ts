import { UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { DeviceIdGuard } from "@shared/guards/device-id.guard";
import { RefreshTokenGuard } from "@shared/guards/refresh-token.guard";

const STORE_GUARDS = {
  deviceId: [DeviceIdGuard],
  accessToken: [DeviceIdGuard, AccessTokenGuard],
  refreshToken: [DeviceIdGuard, RefreshTokenGuard],
} as const;

export const StoreAuth = (type: keyof typeof STORE_GUARDS) =>
  UseGuards(...STORE_GUARDS[type]);
