import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { SettingKey } from "@shared/database/prisma/generated/enums";
import { AdminSettingsService } from "../settings.service";

describe("AdminSettingsService", () => {
  let service: AdminSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminSettingsService>(AdminSettingsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("updateSetting", () => {
    it("should reject a non-numeric value for a CURRENCY setting", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ type: "CURRENCY" });

      await expect(
        service.updateSetting(SettingKey.WELCOME_COUPON, { value: "abc" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.setting.update).not.toHaveBeenCalled();
    });

    it("should reject a decimal value for a CURRENCY setting", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ type: "CURRENCY" });

      await expect(
        service.updateSetting(SettingKey.DELIVERY_FEE, { value: "12.50" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
      });

      expect(prismaMock.setting.update).not.toHaveBeenCalled();
    });

    it("should reject a negative value for a CURRENCY setting", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ type: "CURRENCY" });

      await expect(
        service.updateSetting(SettingKey.MIN_ORDER_VALUE, { value: "-100" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
      });

      expect(prismaMock.setting.update).not.toHaveBeenCalled();
    });

    it("should accept a plain non-negative integer for a CURRENCY setting", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ type: "CURRENCY" });
      prismaMock.setting.update.mockResolvedValue({
        key: SettingKey.WELCOME_COUPON,
        value: "500",
      });

      await service.updateSetting(SettingKey.WELCOME_COUPON, {
        value: "500",
      });

      expect(prismaMock.setting.update).toHaveBeenCalledWith({
        where: { key: SettingKey.WELCOME_COUPON },
        data: { value: "500" },
      });
    });

    it("should not validate the format of a non-CURRENCY setting", async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ type: "TEXT" });
      prismaMock.setting.update.mockResolvedValue({
        key: SettingKey.ALERT_MESSAGE,
        value: "Qualquer coisa",
      });

      await service.updateSetting(SettingKey.ALERT_MESSAGE, {
        value: "Qualquer coisa",
      });

      expect(prismaMock.setting.update).toHaveBeenCalledWith({
        where: { key: SettingKey.ALERT_MESSAGE },
        data: { value: "Qualquer coisa" },
      });
    });
  });
});
