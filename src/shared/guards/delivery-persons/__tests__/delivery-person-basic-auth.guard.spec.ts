import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeliveryPersonBasicAuthGuard } from "../delivery-person-basic-auth.guard";

const DELIVERY_PERSON = { username: "delivery-person", password: "s3cr3t" };

const makeContext = (
  deliveryPersonAuthorization?: string | string[],
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          "x-delivery-person-authorization": deliveryPersonAuthorization,
        },
      }),
    }),
  }) as unknown as ExecutionContext;

const basicHeader = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

describe("DeliveryPersonBasicAuthGuard", () => {
  let guard: DeliveryPersonBasicAuthGuard;

  beforeEach(() => {
    const configService = {
      get: jest.fn(() => DELIVERY_PERSON),
    } as unknown as ConfigService;

    guard = new DeliveryPersonBasicAuthGuard(configService);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow access with valid credentials", () => {
    const context = makeContext(
      basicHeader(DELIVERY_PERSON.username, DELIVERY_PERSON.password),
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should deny access with a wrong password", () => {
    const context = makeContext(basicHeader(DELIVERY_PERSON.username, "wrong"));

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access with a wrong username", () => {
    const context = makeContext(basicHeader("wrong", DELIVERY_PERSON.password));

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the header is missing", () => {
    const context = makeContext(undefined);

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the header arrives duplicated as an array", () => {
    const header = basicHeader(
      DELIVERY_PERSON.username,
      DELIVERY_PERSON.password,
    );
    const context = makeContext([header, header]);

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the scheme is not Basic", () => {
    const context = makeContext(
      `Bearer ${Buffer.from(`${DELIVERY_PERSON.username}:${DELIVERY_PERSON.password}`).toString("base64")}`,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should deny access when the decoded credentials have no colon", () => {
    const context = makeContext(
      `Basic ${Buffer.from("deliverypersononly").toString("base64")}`,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should read the credentials from the deliveryPerson namespace", () => {
    const configService = {
      get: jest.fn(() => DELIVERY_PERSON),
    } as unknown as ConfigService;

    new DeliveryPersonBasicAuthGuard(configService).canActivate(
      makeContext(
        basicHeader(DELIVERY_PERSON.username, DELIVERY_PERSON.password),
      ),
    );

    expect(configService.get).toHaveBeenCalledWith("deliveryPerson");
  });

  it("should keep a password containing a colon intact", () => {
    const configService = {
      get: jest.fn(() => ({ username: "delivery-person", password: "pa:ss" })),
    } as unknown as ConfigService;
    const context = makeContext(basicHeader("delivery-person", "pa:ss"));

    expect(
      new DeliveryPersonBasicAuthGuard(configService).canActivate(context),
    ).toBe(true);
  });
});
