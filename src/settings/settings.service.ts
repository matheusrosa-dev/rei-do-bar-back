import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";

const DELIVERY_FEE_TTL_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class SettingsService {
  private deliveryFee = 0;
  private deliveryFeeLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getDeliveryFee() {
    if (Date.now() - this.deliveryFeeLoadedAt > DELIVERY_FEE_TTL_MS) {
      const setting = await this.prisma.setting.findUnique({
        where: { key: SettingKey.DELIVERY_FEE },
      });

      if (!setting) {
        throw new AppException(
          AppException.errorCodes.settings.DELIVERY_FEE_NOT_CONFIGURED,
          "Taxa de entrega não configurada.",
          AppException.HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (setting.isActive) {
        this.deliveryFee = Number(setting.value);
      } else {
        this.deliveryFee = 0;
      }

      this.deliveryFeeLoadedAt = Date.now();
    }
    return this.deliveryFee;
  }

  async findAll() {
    const settings = await this.prisma.setting.findMany();

    return settings.reduce<Record<string, string>>((acc, setting) => {
      if (setting.isActive) {
        acc[setting.key] = setting.value;
      }

      return acc;
    }, {});
  }
}
