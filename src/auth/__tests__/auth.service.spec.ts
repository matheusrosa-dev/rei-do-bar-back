import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";

const prismaMock = {
  customer: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
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
      // prismaMock.cart.create.mockResolvedValue({});

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
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";

      prismaMock.customer.findFirst.mockResolvedValue({
        id: "customer-id",
        deviceId,
        isActive: true,
      });

      const result = await service.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
    });

    it("should return the same deviceId when its provided but no existing customer is found", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      prismaMock.customer.findFirst.mockResolvedValue(null);
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
      prismaMock.customer.findFirst.mockResolvedValue(null);
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

    it("should throw an exception when the existing customer is inactive", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      prismaMock.customer.findFirst.mockResolvedValue({
        id: "customer-id",
        deviceId,
        isActive: false,
      });

      await expect(service.syncDeviceId({ deviceId })).rejects.toMatchObject({
        code: AppException.errorCodes.auth.INACTIVE_CUSTOMER,
        message:
          "Seu dispositivo está associado a um cliente inativo. Por favor, entre em contato com o suporte.",
        httpStatus: AppException.HttpStatus.FORBIDDEN,
      });
    });
  });
});
