import { SettingKey } from "@shared/database/prisma/generated/enums";
import { Expose } from "class-transformer";

export class SettingsDto {
  @Expose()
  [SettingKey.DELIVERY_FEE]?: string;

  @Expose()
  [SettingKey.ALERT_MESSAGE]?: string;

  @Expose()
  [SettingKey.MIN_ORDER_VALUE]?: string;

  @Expose()
  [SettingKey.WHATSAPP_CONTACT]?: string;

  @Expose()
  [SettingKey.ON_BREAK]?: string;

  @Expose()
  [SettingKey.OUTSIDE_BUSINESS_HOURS]?: string;
}
