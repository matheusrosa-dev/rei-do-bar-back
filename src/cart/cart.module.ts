import { Module } from "@nestjs/common";
import { CartService } from "./cart.service";
import { CartController } from "./cart.controller";
import { SettingsModule } from "../settings/settings.module";
import { CouponsModule } from "../coupons/coupons.module";

@Module({
  imports: [SettingsModule, CouponsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
