/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
/** biome-ignore-all lint/complexity/useLiteralKeys: <its necessary to access private methods> */
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AppException } from "@shared/exceptions/app.exception";
import { ConfigService } from "@nestjs/config";
import { CustomersService } from "../../customers/customers.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { hashString } from "@shared/helpers/string";
import {
  AnonymousCustomerFactory,
  CartFactory,
  CustomerFactory,
} from "@shared/testing/factories";

describe("AuthService", () => {
  let service: AuthService;
  let customersServiceMock: jest.Mocked<
    Pick<CustomersService, "createCustomerFromAnonymous">
  >;

  beforeEach(async () => {
    customersServiceMock = {
      createCustomerFromAnonymous: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CustomersService, useValue: customersServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "auth")
                return {
                  otpExpirationMinutes: 5,
                  jwtSecret: "test-jwt-secret",
                  jwtRefreshSecret: "test-jwt-refresh-secret",
                  jwtExpirationTime: "900s",
                  jwtRefreshExpirationTime: "14d",
                };
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("syncDeviceId", () => {
    const deviceId = "123e4567-e89b-12d3-a456-426614174000";
    const anonymousCustomerId = "anonymous-customer-id";

    it("should generate a new deviceId when none is provided", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: anonymousCustomerId,
      });

      const result = await service.syncDeviceId({});

      expect(result).toEqual({ deviceId: expect.any(String) });
      expect(prismaMock.anonymousCustomer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId: result.deviceId,
            cart: {
              create: {},
            },
          }),
        }),
      );
    });

    it("should return the provided deviceId if its already associated with an anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        deviceId,
      });

      const result = await service.syncDeviceId({
        deviceId,
      });

      expect(result).toEqual({ deviceId });
      expect(prismaMock.anonymousCustomer.create).not.toHaveBeenCalled();
    });

    it("should return the same deviceId when its provided but no existing anonymous customer is found", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: anonymousCustomerId,
      });

      const result = await service.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
    });

    it("should create anonymous customer with cart when provided deviceId has no existing anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: anonymousCustomerId,
      });

      await service.syncDeviceId({ deviceId });

      expect(prismaMock.anonymousCustomer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId,
            cart: {
              create: {},
            },
          }),
        }),
      );
    });
  });

  describe("sendOtpCode", () => {
    const anonymousCustomerId = "anonymous-customer-id";
    const deviceId = "device-id";

    beforeEach(() => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        id: anonymousCustomerId,
      });
    });

    it("should create a new OTP code", async () => {
      const spy = jest.spyOn(service as any, "findAnonymousCustomer");

      prismaMock.otpCode.findFirst.mockResolvedValue(null);

      await service.sendOtpCode(deviceId, {
        phone: "11999999999",
      });

      expect(prismaMock.otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hashedCode: expect.any(String),
            anonymousCustomerId: anonymousCustomerId,
            expiresAt: expect.any(Date),
          }),
        }),
      );

      expect(spy).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({
          throwIfNotFound: true,
        }),
      );
    });

    it("should delete all old OTP codes associated with the anonymous customer before creating a new one", async () => {
      const anonymousCustomerId = "anonymous-customer-id";

      prismaMock.otpCode.findFirst.mockResolvedValue({
        id: "old-otp-code-id",
        hashedCode: "hashed-code",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await service.sendOtpCode("device-id", {
        phone: "11999999999",
      });

      expect(prismaMock.otpCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            anonymousCustomerId,
          },
        }),
      );
    });

    // TODO: adicionar teste de quando enviar o sms
  });

  describe("loginWithOtpCode", () => {
    const deviceId = "device-id";
    const code = "ABC123";

    const anonymousCustomer = AnonymousCustomerFactory.createOne({
      cart: CartFactory.createOne({
        items: [],
      }),
    });

    const activeCustomer = CustomerFactory.createOne({
      cart: CartFactory.createOne({
        items: [],
      }),
    });

    const dto = { phone: activeCustomer.phone, code };

    beforeEach(() => {
      prismaMock.otpCode.deleteMany.mockResolvedValue({ count: 1 });
    });

    it("should return access and refresh tokens when customer already exists", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);

      const result = await service.loginWithOtpCode(deviceId, dto);

      expect(result).toEqual({
        hasToInitAccount: false,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should return hasToInitAccount true when customer does not have a name", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue({
        ...activeCustomer,
        name: null,
      });

      const result = await service.loginWithOtpCode(deviceId, dto);

      expect(result).toEqual({
        hasToInitAccount: true,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should return false for hasToInitAccount when a new customer has a name", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);

      const result = await service.loginWithOtpCode(deviceId, dto);

      expect(result).toEqual({
        hasToInitAccount: false,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should call validateOtpCode with correct parameters", async () => {
      const spy = jest.spyOn(service as any, "validateOtpCode");

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.loginWithOtpCode(deviceId, dto);

      expect(spy).toHaveBeenCalledWith({
        anonymousCustomerId: anonymousCustomer.id,
        code: dto.code,
      });
    });

    it("should create a new customer from anonymous when phone has no existing customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(null);
      customersServiceMock.createCustomerFromAnonymous.mockResolvedValue(
        activeCustomer,
      );
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.loginWithOtpCode(deviceId, dto);

      expect(
        customersServiceMock.createCustomerFromAnonymous,
      ).toHaveBeenCalledWith({
        newCustomer: { phone: dto.phone },
        anonymousCustomer: {
          cartId: anonymousCustomer.cart.id,
          id: anonymousCustomer.id,
        },
      });
    });

    it("should recover the existing customer when a concurrent login already created it", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      // No primeiro lookup o cliente ainda não existe; entre a criação e o
      // retorno, outra requisição concorrente cria o cliente com o mesmo telefone
      prismaMock.customer.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(activeCustomer);

      customersServiceMock.createCustomerFromAnonymous.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.loginWithOtpCode(deviceId, dto);

      expect(prismaMock.customer.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        hasToInitAccount: !activeCustomer.name,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should rethrow non-unique errors raised while creating the customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );
      prismaMock.customer.findUnique.mockResolvedValue(null);

      const unexpectedError = new Error("unexpected");
      customersServiceMock.createCustomerFromAnonymous.mockRejectedValue(
        unexpectedError,
      );

      await expect(service.loginWithOtpCode(deviceId, dto)).rejects.toBe(
        unexpectedError,
      );
    });

    it("should not call createCustomerFromAnonymous when customer already exists", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.loginWithOtpCode(deviceId, dto);

      expect(
        customersServiceMock.createCustomerFromAnonymous,
      ).not.toHaveBeenCalled();
    });

    it("should store the hashed refresh token in the database", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.loginWithOtpCode(deviceId, dto);

      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hashedToken: expect.any(String),
            customerId: activeCustomer.id,
          }),
        }),
      );
    });

    it("should call findAnonymousCustomer with throwIfNotFound and includeCart", async () => {
      const spy = jest.spyOn(service as any, "findAnonymousCustomer");
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        anonymousCustomer,
      );

      prismaMock.customer.findUnique.mockResolvedValue(activeCustomer);
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.loginWithOtpCode(deviceId, dto);

      expect(spy).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({ throwIfNotFound: true, includeCart: true }),
      );
    });
  });

  describe("refreshTokens", () => {
    const token = "plain-refresh-token";
    const hashedToken = hashString(token);
    const refreshTokenRecord = { id: "refresh-token-id", hashedToken };

    const customer = CustomerFactory.createOne({
      cart: CartFactory.createOne({ items: [] }),
    });

    beforeEach(() => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...refreshTokenRecord,
        customerId: customer.id,
        customer: { id: customer.id, phone: customer.phone },
      });
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshToken.create.mockResolvedValue({});
    });

    it("should return access and refresh tokens", async () => {
      const result = await service.refreshTokens({
        customerId: customer.id,
        token,
      });

      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { hashedToken },
        include: {
          customer: {
            select: { id: true, phone: true },
          },
        },
      });

      expect(result).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should delete the old refresh token and create a new one in a transaction", async () => {
      await service.refreshTokens({ customerId: customer.id, token });

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: refreshTokenRecord.id },
        }),
      );
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hashedToken: expect.any(String),
            customerId: customer.id,
          }),
        }),
      );
    });

    it("should throw INVALID_REFRESH_TOKEN and not create a new token when the old token was already rotated concurrently", async () => {
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.refreshTokens({ customerId: customer.id, token }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_REFRESH_TOKEN,
        httpStatus: AppException.HttpStatus.UNAUTHORIZED,
      });

      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it("should throw INVALID_REFRESH_TOKEN if the token is not found in the database", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshTokens({ customerId: customer.id, token }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_REFRESH_TOKEN,
        httpStatus: AppException.HttpStatus.UNAUTHORIZED,
      });
    });

    it("should throw INVALID_REFRESH_TOKEN if the token belongs to a different customer", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...refreshTokenRecord,
        customerId: "different-customer-id",
        customer: {
          id: "different-customer-id",
          phone: customer.phone,
        },
      });

      await expect(
        service.refreshTokens({ customerId: customer.id, token }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_REFRESH_TOKEN,
        httpStatus: AppException.HttpStatus.UNAUTHORIZED,
      });
    });
  });

  describe("logout", () => {
    it("should delete the refresh token associated with the current session", async () => {
      await service.logout({
        customerId: "customer-id",
        token: "plain-refresh-token",
      });
      expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
        where: {
          customerId: "customer-id",
          hashedToken: hashString("plain-refresh-token"),
        },
      });
    });
  });

  describe("findAnonymousCustomer", () => {
    const deviceId = "device-id";

    it("should find anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({});

      await (service as any).findAnonymousCustomer(deviceId);

      expect(prismaMock.anonymousCustomer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });

    it("should include cart when includeCart is true", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({});

      await (service as any).findAnonymousCustomer(deviceId, {
        includeCart: true,
      });

      expect(prismaMock.anonymousCustomer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
          include: { cart: true },
        }),
      );
    });

    it("should return null if anonymous customer not found and throwIfNotFound is false", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);

      const result = await (service as any).findAnonymousCustomer(deviceId, {
        throwIfNotFound: false,
      });

      expect(result).toBeNull();
      expect(prismaMock.anonymousCustomer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });

    it("should throw if anonymous customer not found and throwIfNotFound is true", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).findAnonymousCustomer(deviceId, {
          throwIfNotFound: true,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.ANONYMOUS_CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado para o dispositivo fornecido.",
        httpStatus: AppException.HttpStatus.FORBIDDEN,
      });

      expect(prismaMock.anonymousCustomer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });
  });

  describe("validateOtpCode", () => {
    const code = "ABC123";
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const anonymousCustomerId = "anonymous-customer-id";

    it("should consume the matching, non-expired OTP code atomically", async () => {
      prismaMock.otpCode.deleteMany.mockResolvedValue({ count: 1 });

      await (service as any).validateOtpCode({ anonymousCustomerId, code });

      expect(prismaMock.otpCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            anonymousCustomerId,
            hashedCode,
            expiresAt: {
              gte: expect.any(Date),
            },
          },
        }),
      );
    });

    it("should throw an error when no valid OTP code is consumed", async () => {
      prismaMock.otpCode.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        (service as any).validateOtpCode({
          anonymousCustomerId,
          code: "INVALID",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        message: "Código de verificação inválido ou expirado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("generateTokens", () => {
    it("should generate access and refresh tokens with correct payload and expiration", () => {
      const payload = { customerId: "customer-id", phone: "11999999999" };
      const tokens = (service as any).generateTokens(payload);

      expect(tokens).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        hashedRefreshToken: expect.any(String),
      });

      const verifiedAccessToken = jwt.verify(
        tokens.accessToken,
        (service as any).authConfig.jwtSecret,
      );
      const verifiedRefreshToken = jwt.verify(
        tokens.refreshToken,
        (service as any).authConfig.jwtRefreshSecret,
      );

      const hashedRefreshToken = crypto
        .createHash("sha256")
        .update(tokens.refreshToken)
        .digest("hex");

      expect(tokens.hashedRefreshToken).toBe(hashedRefreshToken);

      expect(verifiedAccessToken).toMatchObject({
        customerId: payload.customerId,
        phone: payload.phone,
      });

      expect(verifiedRefreshToken).toMatchObject({
        customerId: payload.customerId,
        phone: payload.phone,
      });
    });
  });
});
