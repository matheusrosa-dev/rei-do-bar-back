import { ExecutionContext } from "@nestjs/common";
import {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { Reflector } from "@nestjs/core";
import { AppException } from "@shared/exceptions/app.exception";
import { IpThrottlerGuard } from "../ip-throttler.guard";

type ThrottlerInternals = {
  throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void>;
};

describe("IpThrottlerGuard", () => {
  let guard: IpThrottlerGuard;

  beforeEach(() => {
    guard = new IpThrottlerGuard(
      [] as ThrottlerModuleOptions,
      {} as ThrottlerStorage,
      new Reflector(),
    );
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("throws AppException AUTH_007 when the limit is exceeded", async () => {
    expect.assertions(3);

    const internals = guard as unknown as ThrottlerInternals;

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
