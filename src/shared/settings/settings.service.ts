import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { SettingKey } from "@shared/database/prisma/generated/client";

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

      this.deliveryFee = Number(setting!.value);

      this.deliveryFeeLoadedAt = Date.now();
    }
    return this.deliveryFee;
  }
}
