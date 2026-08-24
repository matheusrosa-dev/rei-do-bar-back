import { Module } from "@nestjs/common";
import { AdminDashboardController } from "./dashboard.controller";
import { AdminDashboardService } from "./dashboard.service";

@Module({
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
