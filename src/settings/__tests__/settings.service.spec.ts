import { Test, TestingModule } from "@nestjs/testing";
import { SettingsService } from "../settings.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";
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

  describe("findAll", () => {
    it("should return a map of active settings keyed by their key", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: true },
        {
          key: SettingKey.ALERT_MESSAGE,
          value: "Estamos fechados",
          isActive: true,
        },
      ]);

      const result = await service.findAll();

      expect(prismaMock.setting.findMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        [SettingKey.DELIVERY_FEE]: "500",
        [SettingKey.ALERT_MESSAGE]: "Estamos fechados",
      });
    });

    it("should exclude inactive settings from the result", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: true },
        {
          key: SettingKey.ALERT_MESSAGE,
          value: "Estamos fechados",
          isActive: false,
        },
      ]);

      const result = await service.findAll();

      expect(result).toEqual({ [SettingKey.DELIVERY_FEE]: "500" });
    });

    it("should return an empty object when there are no settings", async () => {
      prismaMock.setting.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual({});
    });
  });
});
