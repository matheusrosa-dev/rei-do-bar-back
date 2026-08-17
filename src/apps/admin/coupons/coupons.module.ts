import { Module } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminCouponsController } from "./coupons.controller";
import { AdminCouponsService } from "./coupons.service";

@Module({
  controllers: [AdminCouponsController],
  providers: [AdminCouponsService, AdminBasicAuthGuard],
})
export class AdminCouponsModule {}
