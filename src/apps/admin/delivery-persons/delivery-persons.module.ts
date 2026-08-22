import { Module } from "@nestjs/common";
import { AdminDeliveryPersonsController } from "./delivery-persons.controller";
import { AdminDeliveryPersonsService } from "./delivery-persons.service";

@Module({
  controllers: [AdminDeliveryPersonsController],
  providers: [AdminDeliveryPersonsService],
})
export class AdminDeliveryPersonsModule {}
