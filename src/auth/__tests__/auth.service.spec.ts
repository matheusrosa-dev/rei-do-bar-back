/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { CartFactory, CustomerFactory } from "@shared/testing/factories";
import { AppException } from "@shared/exceptions/app.exception";
import { ConfigService } from "@nestjs/config";

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
      const customerId = "customer-id";

      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({ id: customerId });

      const result = await service.syncDeviceId({});

      expect(result).toEqual({ deviceId: expect.any(String) });
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId: result.deviceId,
            isActive: true,
            cart: {
              create: {},
            },
          }),
        }),
      );
    });

    it("should return the provided deviceId when customer already exists", async () => {
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      const result = await service.syncDeviceId({
        deviceId: customer.deviceId!,
      });

      expect(result).toEqual({ deviceId: customer.deviceId });
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
    });

    it("should return the same deviceId when its provided but no existing customer is found", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({ id: "new-customer-id" });

      const result = await service.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId,
            isActive: true,
            cart: {
              create: {},
            },
          }),
        }),
      );
    });

    it("should create customer and cart when provided deviceId has no existing customer", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({ id: "new-customer-id" });

      const result = await service.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId,
            isActive: true,
            cart: {
              create: {},
            },
          }),
        }),
      );
    });
  });

  describe("verifyCustomerPhone", () => {
    it("should create a new OTP code if there is no active code for the customer and return it", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      const customerId = "customer-id";

      prismaMock.customer.findUnique.mockResolvedValue({
        deviceId,
        id: customerId,
      });
      prismaMock.otpCodes.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyCustomerPhone(deviceId, {
          phone: "11999999999",
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCodes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: expect.any(String),
            customerId: customerId,
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("findCustomerByDeviceId", () => {
    it("should find customer by deviceId", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.customer.findUnique.mockResolvedValue({});

      await (service as any).findCustomerByDeviceId(deviceId);

      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });

    it("should return null if customer not found and throwIfNotFound is false", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.customer.findUnique.mockResolvedValue(null);

      const result = await (service as any).findCustomerByDeviceId(deviceId, {
        throwIfNotFound: false,
      });

      expect(result).toBeNull();
      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });

    it("should throw if customer not found and throwIfNotFound is true", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).findCustomerByDeviceId(deviceId, {
          throwIfNotFound: true,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado para o dispositivo fornecido.",
        httpStatus: AppException.HttpStatus.FORBIDDEN,
      });

      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId },
        }),
      );
    });
  });

  describe("validateOtpCode", () => {
    it("should validate the OTP code successfully", async () => {
      const customerId = "customer-id";
      const code = "ABC123";
      const dateNow = Date.now();

      prismaMock.otpCodes.findUnique.mockResolvedValue({
        code,
        expiresAt: new Date(dateNow + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({ customerId, code }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCodes.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerId,
            code,
            expiresAt: {
              gte: new Date(dateNow),
            },
          },
        }),
      );
    });

    it("should delete the OTP code after successful validation", async () => {
      const codeId = "otp-code-id";
      const code = "ABC123";

      prismaMock.otpCodes.findUnique.mockResolvedValue({
        id: codeId,
        code,
        expiresAt: new Date(Date.now() + (service as any).otpExpirationMs),
      });

      await expect(
        (service as any).validateOtpCode({
          customerId: "customer-id",
          code,
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.otpCodes.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: codeId,
          },
        }),
      );
    });

    it("should throw an error if OTP code is invalid", async () => {
      prismaMock.otpCodes.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).validateOtpCode({
          customerId: "customer-id",
          code: "INVALID",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        message: "Código de verificação inválido ou expirado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("generateCode", () => {
    it("should generate a 6-digit code", () => {
      const code = (service as any).generateCode();

      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });
  });
});
