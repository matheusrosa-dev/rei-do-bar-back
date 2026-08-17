import { Module } from "@nestjs/common";
import { DeliveryPersonAccessTokenGuard } from "@shared/guards/delivery-person-access-token.guard";
import { DeliveryPersonsOrdersController } from "./orders.controller";
import { DeliveryPersonsOrdersService } from "./orders.service";

@Module({
  controllers: [DeliveryPersonsOrdersController],
  providers: [DeliveryPersonsOrdersService, DeliveryPersonAccessTokenGuard],
})
export class DeliveryPersonsOrdersModule {}
