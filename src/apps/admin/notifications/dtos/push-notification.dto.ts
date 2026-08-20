import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import {
  NotificationAction,
  NotificationTarget,
} from "@shared/database/prisma/generated/enums";

export class PushNotificationDto {
  @IsEnum(NotificationTarget)
  target!: NotificationTarget;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsEnum(NotificationAction)
  action?: NotificationAction;
}
