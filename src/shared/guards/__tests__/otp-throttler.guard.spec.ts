import { ExecutionContext } from "@nestjs/common";
import {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { Reflector } from "@nestjs/core";
import { AppException } from "@shared/exceptions/app.exception";
import { OtpThrottlerGuard } from "../otp-throttler.guard";

type ThrottlerInternals = {
  getTracker(req: Record<string, unknown>): Promise<string>;
  throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void>;
};

describe("OtpThrottlerGuard", () => {
  let guard: OtpThrottlerGuard;
  let internals: ThrottlerInternals;

  beforeEach(() => {
    guard = new OtpThrottlerGuard(
      [] as ThrottlerModuleOptions,
      {} as ThrottlerStorage,
      new Reflector(),
    );
    internals = guard as unknown as ThrottlerInternals;
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("tracks by the x-device-id header", async () => {
    const req = { headers: { "x-device-id": "device-123" }, ip: "1.2.3.4" };

    await expect(internals.getTracker(req)).resolves.toBe("device-123");
  });

  it("falls back to the ip when the device id is absent", async () => {
    const req = { headers: {}, ip: "1.2.3.4" };

    await expect(internals.getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("throws AppException AUTH_007 when the limit is exceeded", async () => {
    expect.assertions(3);

    try {
      await internals.throwThrottlingException(
        {} as ExecutionContext,
        {} as ThrottlerLimitDetail,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(
        AppException.errorCodes.auth.RATE_LIMIT_EXCEEDED,
      );
      expect((error as AppException).httpStatus).toBe(429);
    }
  });
});
