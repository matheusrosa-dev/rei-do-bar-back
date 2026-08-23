import { UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "@shared/guards/store/access-token.guard";
import { DeviceIdGuard } from "@shared/guards/store/device-id.guard";
import { RefreshTokenGuard } from "@shared/guards/store/refresh-token.guard";
import { StoreBasicAuthGuard } from "@shared/guards/store/store-basic-auth.guard";

const STORE_GUARDS = {
  basic: [StoreBasicAuthGuard],
  deviceId: [StoreBasicAuthGuard, DeviceIdGuard],
  accessToken: [StoreBasicAuthGuard, DeviceIdGuard, AccessTokenGuard],
  refreshToken: [StoreBasicAuthGuard, DeviceIdGuard, RefreshTokenGuard],
} as const;

export const StoreAuth = (type: keyof typeof STORE_GUARDS) =>
  UseGuards(...STORE_GUARDS[type]);
