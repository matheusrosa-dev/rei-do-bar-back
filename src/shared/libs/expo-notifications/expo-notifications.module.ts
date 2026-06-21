import { Module } from "@nestjs/common";
import { ExpoNotificationsService } from "./expo-notifications.service";

@Module({
  providers: [ExpoNotificationsService],
  exports: [ExpoNotificationsService],
})
export class ExpoNotificationsModule {}
