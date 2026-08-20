import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import {
  NotificationStatus,
  NotificationTarget,
} from "@shared/database/prisma/generated/enums";

const toArray = (value: unknown) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
};

export class FindAllNotificationsDto {
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsEnum(NotificationTarget, { each: true })
  target?: NotificationTarget[];

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsEnum(NotificationStatus, { each: true })
  status?: NotificationStatus[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
