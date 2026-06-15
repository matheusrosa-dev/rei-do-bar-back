import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, BasicAuthGuard],
})
export class SettingsModule {}
