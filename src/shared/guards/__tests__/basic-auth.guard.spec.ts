import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import { AppException } from "@shared/exceptions/app.exception";
import { BasicAuthGuard } from "../basic-auth.guard";

const ADMIN = { username: "admin", password: "s3cr3t" };
const RATE_LIMIT = { admin: { ttl: 60_000, limit: 5 } };

const makeContext = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
        ip: "1.2.3.4",
      }),
    }),
  }) as unknown as ExecutionContext;

const basicHeader = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

describe("BasicAuthGuard", () => {
  let guard: BasicAuthGuard;
  let increment: jest.Mock;

  beforeEach(() => {
    const configService = {
      get: jest.fn((namespace: string) =>
        namespace === "admin" ? ADMIN : RATE_LIMIT,
      ),
    } as unknown as ConfigService;

    increment = jest.fn().mockResolvedValue({ isBlocked: false });
    const storage = { increment } as unknown as ThrottlerStorage;

    guard = new BasicAuthGuard(configService, storage);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow access with valid credentials without counting an attempt", async () => {
    const context = makeContext(basicHeader(ADMIN.username, ADMIN.password));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(increment).not.toHaveBeenCalled();
  });

  it("should deny access with a wrong password and count the attempt", async () => {
    const context = makeContext(basicHeader(ADMIN.username, "wrong"));

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(increment).toHaveBeenCalledTimes(1);
  });

  it("should deny access with a wrong username", async () => {
    const context = makeContext(basicHeader("wrong", ADMIN.password));

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("should deny access when the Authorization header is missing", async () => {
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("should deny access when the scheme is not Basic", async () => {
    const context = makeContext(
      `Bearer ${Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString("base64")}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("should deny access when the decoded credentials have no colon", async () => {
    const context = makeContext(
      `Basic ${Buffer.from("adminonly").toString("base64")}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("should throw AUTH_007 once the failed-attempt limit is exceeded", async () => {
    expect.assertions(3);
    increment.mockResolvedValueOnce({ isBlocked: true });
    const context = makeContext(basicHeader(ADMIN.username, "wrong"));

    try {
      await guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(
        AppException.errorCodes.auth.RATE_LIMIT_EXCEEDED,
      );
      expect((error as AppException).httpStatus).toBe(429);
    }
  });
});
