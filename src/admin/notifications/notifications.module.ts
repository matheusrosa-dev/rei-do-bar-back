import { Module } from "@nestjs/common";
import { AdminNotificationsService } from "./notifications.service";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminNotificationsController } from "./notifications.controller";
import { ExpoNotificationsModule } from "@shared/libs/expo-notifications/expo-notifications.module";

@Module({
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationsService, BasicAuthGuard],
  imports: [ExpoNotificationsModule],
})
export class AdminNotificationsModule {}
