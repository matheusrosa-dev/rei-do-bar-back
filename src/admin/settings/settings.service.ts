import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { UpdateSettingBodyDto } from "./dtos";
import { SettingKey } from "@shared/database/prisma/generated/enums";

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
}
