/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AppException } from "@shared/exceptions/app.exception";
import { ConfigService } from "@nestjs/config";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
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
    it("should generate a new deviceId when none is provided", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: "anonymous-customer-id",
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
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

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
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: "anonymous-customer-id",
      });

      const result = await service.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
    });

    it("should create anonymous customer with cart when provided deviceId has no existing anonymous customer", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);
      prismaMock.anonymousCustomer.create.mockResolvedValue({
        id: "anonymous-customer-id",
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
    it("should create a new OTP code", async () => {
      const anonymousCustomerId = "anonymous-customer-id";
      const deviceId = "device-id";

      const spy = jest.spyOn(service as any, "findAnonymousCustomer");

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        id: anonymousCustomerId,
      });
      prismaMock.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        service.sendOtpCode(deviceId, {
          phone: "11999999999",
        }),
      ).resolves.toBeUndefined();

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

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        id: anonymousCustomerId,
      });
      prismaMock.otpCode.findFirst.mockResolvedValue({
        id: "old-otp-code-id",
        hashedCode: "hashed-code",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(
        service.sendOtpCode("device-id", {
          phone: "11999999999",
        }),
      ).resolves.toBeUndefined();

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

  describe("findAnonymousCustomer", () => {
    it("should find anonymous customer", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({});

      await (service as any).findAnonymousCustomer(deviceId);

      expect(prismaMock.anonymousCustomer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });

    it("should include cart when includeCart is true", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

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
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

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
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

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
    it("should validate the OTP code successfully", async () => {
      const anonymousCustomerId = "anonymous-customer-id";
      const code = "ABC123";
      const dateNow = Date.now();

      prismaMock.otpCode.findFirst.mockResolvedValue({
        hashedCode: crypto.createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(dateNow + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({ anonymousCustomerId, code }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            anonymousCustomerId,
            expiresAt: {
              gte: expect.any(Date),
            },
          },
        }),
      );
    });

    it("should delete all OTP codes of the anonymous customer after successful validation", async () => {
      const anonymousCustomerId = "anonymous-customer-id";
      const code = "ABC123";

      prismaMock.otpCode.findFirst.mockResolvedValue({
        id: "otp-code-id",
        hashedCode: crypto.createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({
          anonymousCustomerId,
          code,
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            anonymousCustomerId,
          },
        }),
      );
    });

    it("should throw an error if no OTP code is found", async () => {
      prismaMock.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        (service as any).validateOtpCode({
          anonymousCustomerId: "anonymous-customer-id",
          code: "INVALID",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        message: "Código de verificação inválido ou expirado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw an error if the OTP code has different hash", async () => {
      const code = "ABC123";

      prismaMock.otpCode.findFirst.mockResolvedValue({
        hashedCode: crypto
          .createHash("sha256")
          .update("different-code")
          .digest("hex"),
        expiresAt: new Date(Date.now() + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({
          anonymousCustomerId: "anonymous-customer-id",
          code,
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
