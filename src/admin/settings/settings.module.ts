import { Module } from "@nestjs/common";
import { AdminSettingsController } from "./settings.controller";
import { AdminSettingsService } from "./settings.service";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";

@Module({
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService, BasicAuthGuard],
})
export class AdminSettingsModule {}
