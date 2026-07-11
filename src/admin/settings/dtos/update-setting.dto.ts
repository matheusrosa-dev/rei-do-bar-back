import { SettingKey } from "@shared/database/prisma/generated/enums";
import { IsEnum, IsInt, IsString, Min } from "class-validator";

export class UpdateSettingParamsDto {
  @IsEnum(SettingKey)
  settingKey!: SettingKey;
}

export class UpdateSettingBodyDto {
  @IsString()
  value!: string;
}

export class WelcomeCouponValue {
  @IsInt()
  @Min(0)
  discountValue!: number;

  @IsInt()
  @Min(0)
  minOrderValue!: number;
}
