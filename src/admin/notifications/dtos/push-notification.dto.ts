import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { NotificationTarget } from "../helpers";
import { NotificationAction } from "@shared/types/notifications";

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
