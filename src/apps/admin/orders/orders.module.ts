import { Module } from "@nestjs/common";
import { SettingsModule } from "../../store/settings/settings.module";
import { AdminOrdersController } from "./orders.controller";
import { AdminOrdersService } from "./orders.service";

@Module({
  imports: [SettingsModule],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
})
export class AdminOrdersModule {}
