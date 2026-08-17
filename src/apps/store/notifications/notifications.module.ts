import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ExpoNotificationsModule } from "@shared/libs/expo-notifications/expo-notifications.module";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  imports: [ExpoNotificationsModule],
})
export class NotificationsModule {}
