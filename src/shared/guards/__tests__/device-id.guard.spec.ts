import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DeviceIdGuard } from "../device-id.guard";

const makeContext = (deviceId: unknown, isPublic = false): ExecutionContext => {
  const reflector = new Reflector();
  jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(isPublic as never);

  return {
    reflector,
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-device-id": deviceId },
      }),
    }),
  } as unknown as ExecutionContext;
};

describe("DeviceIdGuard", () => {
  let guard: DeviceIdGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new DeviceIdGuard(reflector);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  describe("when the route is public", () => {
    it("should allow access regardless of deviceId", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true as never);

      const context = makeContext(undefined, true);
      // override the guard's own reflector
      (guard as unknown as { reflector: Reflector }).reflector = reflector;
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true as never);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("when the route is protected", () => {
    beforeEach(() => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue(false as never);
    });

    it("should allow access with a valid UUID v4", () => {
      const context = makeContext("123e4567-e89b-12d3-a456-426614174000");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access with a valid UUID v1", () => {
      const context = makeContext("550e8400-e29b-11d4-a716-446655440000");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should deny access when deviceId is missing", () => {
      const context = makeContext(undefined);
      expect(guard.canActivate(context)).toBe(false);
    });

    it("should deny access when deviceId is not a string", () => {
      const context = makeContext(12345);
      expect(guard.canActivate(context)).toBe(false);
    });

    it("should deny access when deviceId is not a valid UUID", () => {
      const context = makeContext("not-a-uuid");
      expect(guard.canActivate(context)).toBe(false);
    });

    it("should deny access when deviceId is an empty string", () => {
      const context = makeContext("");
      expect(guard.canActivate(context)).toBe(false);
    });
  });
});
