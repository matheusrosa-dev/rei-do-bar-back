import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { UpdateSettingBodyDto, WelcomeCouponValue } from "./dtos";
import { SettingKey } from "@shared/database/prisma/generated/enums";
import { AppException } from "@shared/exceptions/app.exception";
import { validateSync } from "class-validator";
import { plainToInstance } from "class-transformer";

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
    if (settingKey === SettingKey.WELCOME_COUPON) {
      this.assertWelcomeCouponValue(dto.value);
    }

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

  private assertWelcomeCouponValue(value: string) {
    let parsed: {
      discountValue: number;
      minOrderValue: number;
    };

    try {
      parsed = JSON.parse(value);
    } catch {
      throw new AppException(
        AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
        "Valor da configuração inválido.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const instance = plainToInstance(WelcomeCouponValue, parsed);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new AppException(
        AppException.errorCodes.adminSettings.INVALID_SETTING_VALUE,
        "Valor do cupom de boas-vindas inválido.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
