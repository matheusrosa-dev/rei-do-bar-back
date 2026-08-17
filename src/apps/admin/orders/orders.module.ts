import { Module } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminOrdersController } from "./orders.controller";
import { AdminOrdersService } from "./orders.service";

@Module({
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService, AdminBasicAuthGuard],
})
export class AdminOrdersModule {}
