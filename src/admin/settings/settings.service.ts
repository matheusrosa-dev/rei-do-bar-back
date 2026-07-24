import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { UpdateSettingBodyDto } from "./dtos";
import {
  SettingKey,
  SettingType,
} from "@shared/database/prisma/generated/enums";
import { AppException } from "@shared/exceptions/app.exception";

const CENTS_PATTERN = /^\d+$/;

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.setting.findMany({
      orderBy: {
        key: "asc",
      },
    });

    return settings;
  }

  async updateSetting(settingKey: SettingKey, dto: UpdateSettingBodyDto) {
    await this.assertValueMatchesType(settingKey, dto.value);

    const settings = await this.prisma.setting.update({
      where: {
        key: settingKey,
      },
      data: {
        value: dto.value,
      },
    });

    return settings;
  }

  async activateSetting(settingKey: SettingKey) {
    await this.prisma.setting.update({
      where: {
        key: settingKey,
      },
      data: {
        isActive: true,
      },
    });
  }

  async deactivateSetting(settingKey: SettingKey) {
    await this.prisma.setting.update({
      where: {
        key: settingKey,
      },
      data: {
        isActive: false,
      },
    });
  }

  private async assertValueMatchesType(settingKey: SettingKey, value: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { key: settingKey },
      select: { type: true },
    });

    if (setting?.type !== SettingType.CURRENCY) {
      return;
    }

    if (!CENTS_PATTERN.test(value)) {
      throw new AppException(
        AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
        "O valor deve ser um número inteiro em centavos, sem símbolos ou separadores.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }
}
