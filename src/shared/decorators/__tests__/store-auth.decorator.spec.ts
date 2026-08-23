import { Controller } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { DeviceIdGuard } from "@shared/guards/device-id.guard";
import { RefreshTokenGuard } from "@shared/guards/refresh-token.guard";
import { StoreBasicAuthGuard } from "@shared/guards/store-basic-auth.guard";
import { StoreAuth } from "../store-auth.decorator";

const guardsOf = (level: Parameters<typeof StoreAuth>[0]) => {
  @Controller()
  @StoreAuth(level)
  class TestController {}

  return Reflect.getMetadata(GUARDS_METADATA, TestController);
};

describe("StoreAuth", () => {
  it("should apply only the store basic-auth guard on the basic level", () => {
    expect(guardsOf("basic")).toEqual([StoreBasicAuthGuard]);
  });

  it("should apply the store basic-auth guard before the device-id guard", () => {
    expect(guardsOf("deviceId")).toEqual([StoreBasicAuthGuard, DeviceIdGuard]);
  });

  it("should apply the device-id guard before the access-token guard", () => {
    expect(guardsOf("accessToken")).toEqual([
      StoreBasicAuthGuard,
      DeviceIdGuard,
      AccessTokenGuard,
    ]);
  });

  it("should apply the device-id guard before the refresh-token guard", () => {
    expect(guardsOf("refreshToken")).toEqual([
      StoreBasicAuthGuard,
      DeviceIdGuard,
      RefreshTokenGuard,
    ]);
  });
});
