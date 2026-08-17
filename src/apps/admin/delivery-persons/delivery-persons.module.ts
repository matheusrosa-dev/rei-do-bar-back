import { Module } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminDeliveryPersonsController } from "./delivery-persons.controller";
import { AdminDeliveryPersonsService } from "./delivery-persons.service";

@Module({
  controllers: [AdminDeliveryPersonsController],
  providers: [AdminDeliveryPersonsService, AdminBasicAuthGuard],
})
export class AdminDeliveryPersonsModule {}
