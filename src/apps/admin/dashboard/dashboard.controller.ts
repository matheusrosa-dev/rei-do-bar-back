import { Controller, Get } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminDashboardService } from "./dashboard.service";

@Controller("admin/dashboard")
@AdminAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get("delivery-persons")
  findDeliveryPersonsPerformance() {
    return this.dashboardService.findDeliveryPersonsPerformance();
  }
}
