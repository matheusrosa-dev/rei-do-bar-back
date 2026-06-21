import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminOrdersController } from "./orders.controller";
import { AdminOrdersService } from "./orders.service";

@Module({
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService, BasicAuthGuard],
})
export class AdminOrdersModule {}
