import { Module } from "@nestjs/common";
import { AdminCouponsController } from "./coupons.controller";
import { AdminCouponsService } from "./coupons.service";

@Module({
  controllers: [AdminCouponsController],
  providers: [AdminCouponsService],
})
export class AdminCouponsModule {}
