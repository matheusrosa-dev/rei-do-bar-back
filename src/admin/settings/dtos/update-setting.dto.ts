import { SettingKey } from "@shared/database/prisma/generated/enums";
import { IsEnum, IsString } from "class-validator";

export class UpdateSettingParamsDto {
  @IsEnum(SettingKey)
  settingKey!: SettingKey;
}

export class UpdateSettingBodyDto {
  @IsString()
  value!: string;
}
