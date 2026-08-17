import { Module } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { OrdersController } from "./orders.controller";
import { SettingsModule } from "../settings/settings.module";
import { CouponsModule } from "../coupons/coupons.module";

@Module({
  imports: [SettingsModule, CouponsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
