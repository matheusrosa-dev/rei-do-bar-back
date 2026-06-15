import { Test, TestingModule } from "@nestjs/testing";
import { SettingsService } from "../settings.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";

describe("SettingsService", () => {
  let service: SettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getDeliveryFee", () => {
    it("should fetch from database on first call (cache miss)", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({
        value: "500",
        isActive: true,
      });

      const result = await service.getDeliveryFee();

      expect(prismaMock.setting.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.setting.findUnique).toHaveBeenCalledWith({
        where: { key: SettingKey.DELIVERY_FEE },
      });
      expect(result).toBe(500);
    });

    it("should return cached value on subsequent calls within TTL", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({
        value: "300",
        isActive: true,
      });

      await service.getDeliveryFee();
      await service.getDeliveryFee();
      const result = await service.getDeliveryFee();

      expect(prismaMock.setting.findUnique).toHaveBeenCalledTimes(1);
      expect(result).toBe(300);
    });

    it("should re-fetch from database after TTL expires", async () => {
      const TTL_MS = 5 * 60 * 1000;

      // Each getDeliveryFee() that hits the DB calls Date.now() twice:
      // once for the condition check and once to record deliveryFeeLoadedAt.
      jest
        .spyOn(Date, "now")
        .mockReturnValueOnce(TTL_MS + 1) // 1st call: check (> initial 0) → fetches
        .mockReturnValueOnce(TTL_MS + 1) // 1st call: set deliveryFeeLoadedAt
        .mockReturnValueOnce(2 * TTL_MS + 2) // 2nd call: check (> TTL_MS + 1) → fetches again
        .mockReturnValueOnce(2 * TTL_MS + 2); // 2nd call: set deliveryFeeLoadedAt

      prismaMock.setting.findUnique.mockResolvedValue({
        value: "200",
        isActive: true,
      });
      await service.getDeliveryFee();

      prismaMock.setting.findUnique.mockResolvedValue({
        value: "400",
        isActive: true,
      });
      const result = await service.getDeliveryFee();

      expect(prismaMock.setting.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toBe(400);

      jest.restoreAllMocks();
    });

    it("should convert the setting string value to a number", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({
        value: "750",
        isActive: true,
      });

      const result = await service.getDeliveryFee();

      expect(result).toBe(750);
      expect(typeof result).toBe("number");
    });

    it("should return 0 when the setting is inactive", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({
        value: "750",
        isActive: false,
      });

      const result = await service.getDeliveryFee();

      expect(result).toBe(0);
    });

    it("should throw DELIVERY_FEE_NOT_CONFIGURED when the setting is missing", async () => {
      prismaMock.setting.findUnique.mockResolvedValue(null);

      await expect(service.getDeliveryFee()).rejects.toMatchObject({
        code: AppException.errorCodes.settings.DELIVERY_FEE_NOT_CONFIGURED,
        message: "Taxa de entrega não configurada.",
        httpStatus: AppException.HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe("findAll", () => {
    it("should return a map of active settings keyed by their key", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: true },
        { key: "STORE_NAME", value: "Rei do Bar", isActive: true },
      ]);

      const result = await service.findAll();

      expect(prismaMock.setting.findMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        [SettingKey.DELIVERY_FEE]: "500",
        STORE_NAME: "Rei do Bar",
      });
    });

    it("should exclude inactive settings from the result", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: true },
        { key: "STORE_NAME", value: "Rei do Bar", isActive: false },
      ]);

      const result = await service.findAll();

      expect(result).toEqual({ [SettingKey.DELIVERY_FEE]: "500" });
    });

    it("should return an empty object when there are no settings", async () => {
      prismaMock.setting.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual({});
    });

    it("should return an empty object when all settings are inactive", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: false },
      ]);

      const result = await service.findAll();

      expect(result).toEqual({});
    });
  });
});
