import { ExecutionContext } from "@nestjs/common";
import { AppException } from "@shared/exceptions/app.exception";
import { ICurrentSession } from "@shared/types/jwt";
import jwt from "jsonwebtoken";

jest.mock("@nestjs/common", () => ({
  ...jest.requireActual("@nestjs/common"),
  createParamDecorator: (fn: Function) => fn,
}));

// Import after the mock so createParamDecorator returns the factory fn directly
// eslint-disable-next-line import/first
import { CurrentSession } from "../current-session.decorator";

type DecoratorFactory = (
  _data: unknown,
  ctx: ExecutionContext,
) => ICurrentSession;

const factory = CurrentSession as unknown as DecoratorFactory;

const makeContext = (options: {
  token?: string;
  deviceId?: string;
  url?: string;
  method?: string;
  user?: ICurrentSession;
}): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          ...(options.deviceId !== undefined && {
            "x-device-id": options.deviceId,
          }),
          ...(options.token && { authorization: `Bearer ${options.token}` }),
        },
        url: options.url ?? "/products",
        method: options.method ?? "GET",
        user: options.user,
      }),
    }),
  }) as unknown as ExecutionContext;

describe("CurrentSession", () => {
  describe("when there is no token", () => {
    it("should return an object with only the deviceId", () => {
      const context = makeContext({ deviceId: "device-abc" });

      expect(factory(undefined, context)).toEqual({ deviceId: "device-abc" });
    });

    it("should return an object with undefined deviceId when neither is present", () => {
      const context = makeContext({});

      expect(factory(undefined, context)).toEqual({ deviceId: undefined });
    });
  });

  describe("when there is a token and request.user is present", () => {
    it("should return customerId and phone from request.user", () => {
      const context = makeContext({
        token: "any-token",
        user: { customerId: "cust-123", phone: "11999999999" },
      });

      expect(factory(undefined, context)).toEqual({
        customerId: "cust-123",
        phone: "11999999999",
      });
    });

    it("should also include the token when the route is POST /auth/refresh", () => {
      const context = makeContext({
        token: "refresh-token",
        url: "/auth/refresh",
        method: "POST",
        user: { customerId: "cust-123", phone: "11999999999" },
      });

      expect(factory(undefined, context)).toEqual({
        token: "refresh-token",
        customerId: "cust-123",
        phone: "11999999999",
      });
    });

    it("should retain the deviceId alongside the authenticated session", () => {
      const context = makeContext({
        token: "any-token",
        deviceId: "device-abc",
        user: { customerId: "cust-123", phone: "11999999999" },
      });

      expect(factory(undefined, context)).toEqual({
        deviceId: "device-abc",
        customerId: "cust-123",
        phone: "11999999999",
      });
    });

    it("should not include the token when only the url matches but method is not POST", () => {
      const context = makeContext({
        token: "some-token",
        url: "/auth/refresh",
        method: "GET",
        user: { customerId: "cust-123", phone: "11999999999" },
      });

      expect(factory(undefined, context)).toEqual({
        customerId: "cust-123",
        phone: "11999999999",
      });
    });
  });

  describe("when there is a token and no request.user", () => {
    const JWT_SECRET = "test-secret";

    beforeEach(() => {
      process.env.AUTH_JWT_SECRET = JWT_SECRET;
    });

    afterEach(() => {
      delete process.env.AUTH_JWT_SECRET;
    });

    it("should verify the JWT and return customerId and phone from its payload", () => {
      const token = jwt.sign(
        { customerId: "cust-456", phone: "11888888888" },
        JWT_SECRET,
      );
      const context = makeContext({ token });

      expect(factory(undefined, context)).toMatchObject({
        customerId: "cust-456",
        phone: "11888888888",
      });
    });

    it("should include the token when the route is POST /auth/refresh", () => {
      const token = jwt.sign(
        { customerId: "cust-456", phone: "11888888888" },
        JWT_SECRET,
      );
      const context = makeContext({
        token,
        url: "/auth/refresh",
        method: "POST",
      });

      expect(factory(undefined, context)).toMatchObject({
        token,
        customerId: "cust-456",
        phone: "11888888888",
      });
    });

    it("should throw AppException when the JWT is invalid", () => {
      const context = makeContext({ token: "invalid.jwt.token" });

      expect(() => factory(undefined, context)).toThrow(AppException);
    });

    it("should throw AppException with INVALID_TOKEN_IN_DECORATOR code when the JWT is invalid", () => {
      const context = makeContext({ token: "invalid.jwt.token" });

      try {
        factory(undefined, context);
        fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AppException);
        expect((e as AppException).code).toBe(
          AppException.errorCodes.auth.INVALID_TOKEN_IN_DECORATOR,
        );
        expect((e as AppException).httpStatus).toBe(
          AppException.HttpStatus.UNAUTHORIZED,
        );
      }
    });

    it("should throw AppException when the JWT is signed with a different secret", () => {
      const token = jwt.sign({ customerId: "cust-456" }, "wrong-secret");
      const context = makeContext({ token });

      expect(() => factory(undefined, context)).toThrow(AppException);
    });
  });
});
