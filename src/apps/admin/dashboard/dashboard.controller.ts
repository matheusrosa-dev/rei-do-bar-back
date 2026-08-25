import { Controller, Get, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminDashboardService } from "./dashboard.service";
import { FindDeliveryPersonsPerformanceDto } from "./dtos";

@Controller("admin/dashboard")
@AdminAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get("delivery-persons")
  findDeliveryPersonsPerformance(
    @Query() query: FindDeliveryPersonsPerformanceDto,
  ) {
    return this.dashboardService.findDeliveryPersonsPerformance(query);
  }
}
