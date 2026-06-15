import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.setting.findMany();

    return settings.reduce(
      (acc, setting) => {
        if (setting.isActive) {
          acc[setting.key] = setting.value;
        }

        return acc;
      },
      {} as Record<SettingKey, string>,
    );
  }
}
