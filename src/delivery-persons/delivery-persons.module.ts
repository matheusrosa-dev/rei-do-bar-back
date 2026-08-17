import { Module } from "@nestjs/common";
import { DeliveryPersonsAuthModule } from "./auth/auth.module";
import { DeliveryPersonsOrdersModule } from "./orders/orders.module";

@Module({
  imports: [DeliveryPersonsAuthModule, DeliveryPersonsOrdersModule],
})
export class DeliveryPersonsModule {}
