import { SettingKey } from "@shared/database/prisma/generated/enums";
import { IsEnum } from "class-validator";

export class ToggleStatusSettingDto {
  @IsEnum(SettingKey)
  settingKey!: SettingKey;
}
