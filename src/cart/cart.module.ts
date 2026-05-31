import { Module } from "@nestjs/common";
import { CartService } from "./cart.service";
import { CartController } from "./cart.controller";
import { SettingsModule } from "@shared/settings/settings.module";

@Module({
  imports: [SettingsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
