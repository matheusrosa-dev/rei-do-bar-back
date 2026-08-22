import { Module } from "@nestjs/common";
import { AdminNotificationsService } from "./notifications.service";
import { AdminNotificationsController } from "./notifications.controller";
import { ExpoNotificationsModule } from "@shared/libs/expo-notifications/expo-notifications.module";
import { AdminNotificationsListener } from "./notifications.listener";

@Module({
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationsService, AdminNotificationsListener],
  imports: [ExpoNotificationsModule],
})
export class AdminNotificationsModule {}
