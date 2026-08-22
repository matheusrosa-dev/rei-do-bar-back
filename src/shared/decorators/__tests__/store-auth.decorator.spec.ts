import { Controller } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { DeviceIdGuard } from "@shared/guards/device-id.guard";
import { RefreshTokenGuard } from "@shared/guards/refresh-token.guard";
import { StoreAuth } from "../store-auth.decorator";

const guardsOf = (level: Parameters<typeof StoreAuth>[0]) => {
  @Controller()
  @StoreAuth(level)
  class TestController {}

  return Reflect.getMetadata(GUARDS_METADATA, TestController);
};

describe("StoreAuth", () => {
  it("should apply only the device-id guard on the deviceId level", () => {
    expect(guardsOf("deviceId")).toEqual([DeviceIdGuard]);
  });

  it("should apply the device-id guard before the access-token guard", () => {
    expect(guardsOf("accessToken")).toEqual([DeviceIdGuard, AccessTokenGuard]);
  });

  it("should apply the device-id guard before the refresh-token guard", () => {
    expect(guardsOf("refreshToken")).toEqual([
      DeviceIdGuard,
      RefreshTokenGuard,
    ]);
  });
});
