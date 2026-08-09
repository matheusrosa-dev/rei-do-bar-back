import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminDeliveryPersonsController } from "./delivery-persons.controller";
import { AdminDeliveryPersonsService } from "./delivery-persons.service";

@Module({
  controllers: [AdminDeliveryPersonsController],
  providers: [AdminDeliveryPersonsService, BasicAuthGuard],
})
export class AdminDeliveryPersonsModule {}
