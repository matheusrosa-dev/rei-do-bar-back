import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";

const DELIVERY_FEE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SettingsService {
  private deliveryFee = 0;
  private deliveryFeeLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getDeliveryFee(): Promise<number> {
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

      this.deliveryFee = Number(setting.value);

      this.deliveryFeeLoadedAt = Date.now();
    }
    return this.deliveryFee;
  }
}
