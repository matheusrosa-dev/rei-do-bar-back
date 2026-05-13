/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AppException } from "@shared/exceptions/app.exception";
import { ConfigService } from "@nestjs/config";
import crypto from "node:crypto";

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
              if (key === "auth") return { otpExpirationMinutes: 5 };
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

  describe("verifyPhone", () => {
    it("should create a new OTP code if there is no active code for the anonymous customer and return it", async () => {
      const anonymousCustomerId = "anonymous-customer-id";
      const deviceId = "device-id";

      const spy = jest.spyOn(service as any, "findAnonymousCustomer");

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        id: anonymousCustomerId,
      });
      prismaMock.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyPhone(deviceId, {
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

    it("should not create a new OTP code if there is an active code for the anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        id: "anonymous-customer-id",
      });
      prismaMock.otpCode.findFirst.mockResolvedValue({
        hashedCode: "existing-hashed-code",
      });

      await expect(
        service.verifyPhone("device-id", {
          phone: "11999999999",
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCode.create).not.toHaveBeenCalled();
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

    it("should delete the OTP code after successful validation", async () => {
      const codeId = "otp-code-id";
      const code = "ABC123";

      prismaMock.otpCode.findFirst.mockResolvedValue({
        id: codeId,
        hashedCode: crypto.createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({
          anonymousCustomerId: "anonymous-customer-id",
          code,
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCode.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: codeId,
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

  describe("generateHashedCode", () => {
    it("should generate a 6-digit code and return its SHA-256 hash", () => {
      const spy = jest.spyOn(service as any, "hashCode");

      const code = (service as any).generateHashedCode();

      expect(code).toHaveLength(64); // SHA-256 hash length in hexadecimal
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("hashCode", () => {
    it("should return the SHA-256 hash of the input code", () => {
      const code = "ABC123";
      const expectedHash = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

      const result = (service as any).hashCode(code);

      expect(result).toBe(expectedHash);
    });
  });
});
