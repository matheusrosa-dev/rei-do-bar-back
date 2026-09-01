import { Controller, Get, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminDashboardService } from "./dashboard.service";
import {
  FindAccountsSeriesDto,
  FindDeliveryPersonsPerformanceDto,
  FindSeriesDto,
  FindSummaryDto,
} from "./dtos";

@Controller("admin/dashboard")
@AdminAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get("accounts-series")
  findAccountsSeries(@Query() query: FindAccountsSeriesDto) {
    return this.dashboardService.findAccountsSeries(query);
  }

  @Get("delivery-persons")
  findDeliveryPersonsPerformance(
    @Query() query: FindDeliveryPersonsPerformanceDto,
  ) {
    return this.dashboardService.findDeliveryPersonsPerformance(query);
  }

  @Get("series")
  findSeries(@Query() query: FindSeriesDto) {
    return this.dashboardService.findSeries(query);
  }

  @Get("summary")
  findSummary(@Query() query: FindSummaryDto) {
    return this.dashboardService.findSummary(query);
  }
}
