import { Module } from "@nestjs/common";
import { AdminSettingsController } from "./settings.controller";
import { AdminSettingsService } from "./settings.service";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";

@Module({
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService, AdminBasicAuthGuard],
})
export class AdminSettingsModule {}
