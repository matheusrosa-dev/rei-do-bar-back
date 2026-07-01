import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminCouponsController } from "./coupons.controller";
import { AdminCouponsService } from "./coupons.service";

@Module({
  controllers: [AdminCouponsController],
  providers: [AdminCouponsService, BasicAuthGuard],
})
export class AdminCouponsModule {}
