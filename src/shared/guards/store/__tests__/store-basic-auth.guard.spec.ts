import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StoreBasicAuthGuard } from "../store-basic-auth.guard";

const STORE = { username: "store", password: "s3cr3t" };

const makeContext = (
  storeAuthorization?: string | string[],
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-store-authorization": storeAuthorization },
      }),
    }),
  }) as unknown as ExecutionContext;

const basicHeader = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

describe("StoreBasicAuthGuard", () => {
  let guard: StoreBasicAuthGuard;

  beforeEach(() => {
    const configService = {
      get: jest.fn(() => STORE),
    } as unknown as ConfigService;

    guard = new StoreBasicAuthGuard(configService);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow access with valid credentials", () => {
    const context = makeContext(basicHeader(STORE.username, STORE.password));

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should deny access with a wrong password", () => {
    const context = makeContext(basicHeader(STORE.username, "wrong"));

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access with a wrong username", () => {
    const context = makeContext(basicHeader("wrong", STORE.password));

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the header is missing", () => {
    const context = makeContext(undefined);

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the header arrives duplicated as an array", () => {
    const header = basicHeader(STORE.username, STORE.password);
    const context = makeContext([header, header]);

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the scheme is not Basic", () => {
    const context = makeContext(
      `Bearer ${Buffer.from(`${STORE.username}:${STORE.password}`).toString("base64")}`,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the decoded credentials have no colon", () => {
    const context = makeContext(
      `Basic ${Buffer.from("storeonly").toString("base64")}`,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should read the credentials from the store namespace", () => {
    const configService = {
      get: jest.fn(() => STORE),
    } as unknown as ConfigService;

    new StoreBasicAuthGuard(configService).canActivate(
      makeContext(basicHeader(STORE.username, STORE.password)),
    );

    expect(configService.get).toHaveBeenCalledWith("store");
  });

  it("should keep a password containing a colon intact", () => {
    const configService = {
      get: jest.fn(() => ({ username: "store", password: "pa:ss" })),
    } as unknown as ConfigService;
    const context = makeContext(basicHeader("store", "pa:ss"));

    expect(new StoreBasicAuthGuard(configService).canActivate(context)).toBe(
      true,
    );
  });
});
