import { Module } from "@nestjs/common";
import { DeliveryPersonsAuthController } from "./auth.controller";
import { DeliveryPersonsAuthService } from "./auth.service";

@Module({
  controllers: [DeliveryPersonsAuthController],
  providers: [DeliveryPersonsAuthService],
})
export class DeliveryPersonsAuthModule {}
