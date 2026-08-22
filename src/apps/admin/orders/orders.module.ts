import { Module } from "@nestjs/common";
import { AdminOrdersController } from "./orders.controller";
import { AdminOrdersService } from "./orders.service";

@Module({
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
})
export class AdminOrdersModule {}
