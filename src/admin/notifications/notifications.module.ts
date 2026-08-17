import { Module } from "@nestjs/common";
import { AdminNotificationsService } from "./notifications.service";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminNotificationsController } from "./notifications.controller";
import { ExpoNotificationsModule } from "@shared/libs/expo-notifications/expo-notifications.module";
import { AdminNotificationsListener } from "./notifications.listener";

@Module({
  controllers: [AdminNotificationsController],
  providers: [
    AdminNotificationsService,
    AdminNotificationsListener,
    AdminBasicAuthGuard,
  ],
  imports: [ExpoNotificationsModule],
})
export class AdminNotificationsModule {}
