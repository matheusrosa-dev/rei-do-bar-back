import { Module } from "@nestjs/common";
import { AdminSettingsController } from "./settings.controller";
import { AdminSettingsService } from "./settings.service";

@Module({
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
})
export class AdminSettingsModule {}
