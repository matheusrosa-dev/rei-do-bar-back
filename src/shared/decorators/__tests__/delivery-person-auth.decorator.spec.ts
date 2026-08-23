import { Controller } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { DeliveryPersonAccessTokenGuard } from "@shared/guards/delivery-persons/delivery-person-access-token.guard";
import { DeliveryPersonBasicAuthGuard } from "@shared/guards/delivery-persons/delivery-person-basic-auth.guard";
import { DeliveryPersonRefreshTokenGuard } from "@shared/guards/delivery-persons/delivery-person-refresh-token.guard";
import { DeliveryPersonAuth } from "../delivery-person-auth.decorator";

const guardsOf = (level: Parameters<typeof DeliveryPersonAuth>[0]) => {
  @Controller()
  @DeliveryPersonAuth(level)
  class TestController {}

  return Reflect.getMetadata(GUARDS_METADATA, TestController);
};

describe("DeliveryPersonAuth", () => {
  it("should apply only the delivery-person basic-auth guard on the basic level", () => {
    expect(guardsOf("basic")).toEqual([DeliveryPersonBasicAuthGuard]);
  });

  it("should apply the basic-auth guard before the access-token guard", () => {
    expect(guardsOf("accessToken")).toEqual([
      DeliveryPersonBasicAuthGuard,
      DeliveryPersonAccessTokenGuard,
    ]);
  });

  it("should apply the basic-auth guard before the refresh-token guard", () => {
    expect(guardsOf("refreshToken")).toEqual([
      DeliveryPersonBasicAuthGuard,
      DeliveryPersonRefreshTokenGuard,
    ]);
  });
});
