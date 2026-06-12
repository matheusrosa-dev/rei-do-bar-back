import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BasicAuthGuard } from "../basic-auth.guard";

const ADMIN = { username: "admin", password: "s3cr3t" };

const makeContext = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
      }),
    }),
  }) as unknown as ExecutionContext;

const basicHeader = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

describe("BasicAuthGuard", () => {
  let guard: BasicAuthGuard;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue(ADMIN),
    } as unknown as ConfigService;

    guard = new BasicAuthGuard(configService);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow access with valid credentials", () => {
    const context = makeContext(basicHeader(ADMIN.username, ADMIN.password));
    expect(guard.canActivate(context)).toBe(true);
  });

  it("should deny access with a wrong password", () => {
    const context = makeContext(basicHeader(ADMIN.username, "wrong"));
    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access with a wrong username", () => {
    const context = makeContext(basicHeader("wrong", ADMIN.password));
    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the Authorization header is missing", () => {
    const context = makeContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the scheme is not Basic", () => {
    const context = makeContext(
      `Bearer ${Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString("base64")}`,
    );
    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the decoded credentials have no colon", () => {
    const context = makeContext(
      `Basic ${Buffer.from("adminonly").toString("base64")}`,
    );
    expect(guard.canActivate(context)).toBe(false);
  });
});
