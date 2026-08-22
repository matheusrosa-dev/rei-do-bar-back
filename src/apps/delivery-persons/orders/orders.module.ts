import { Module } from "@nestjs/common";
import { DeliveryPersonsOrdersController } from "./orders.controller";
import { DeliveryPersonsOrdersService } from "./orders.service";

@Module({
  controllers: [DeliveryPersonsOrdersController],
  providers: [DeliveryPersonsOrdersService],
})
export class DeliveryPersonsOrdersModule {}
