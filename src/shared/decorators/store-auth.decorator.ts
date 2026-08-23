import { UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { DeviceIdGuard } from "@shared/guards/device-id.guard";
import { RefreshTokenGuard } from "@shared/guards/refresh-token.guard";
import { StoreBasicAuthGuard } from "@shared/guards/store-basic-auth.guard";

const STORE_GUARDS = {
  basic: [StoreBasicAuthGuard],
  deviceId: [StoreBasicAuthGuard, DeviceIdGuard],
  accessToken: [StoreBasicAuthGuard, DeviceIdGuard, AccessTokenGuard],
  refreshToken: [StoreBasicAuthGuard, DeviceIdGuard, RefreshTokenGuard],
} as const;

export const StoreAuth = (type: keyof typeof STORE_GUARDS) =>
  UseGuards(...STORE_GUARDS[type]);
