import { Module } from "@nestjs/common";
import { DeliveryPersonRefreshTokenGuard } from "@shared/guards/delivery-person-refresh-token.guard";
import { DeliveryPersonsAuthController } from "./auth.controller";
import { DeliveryPersonsAuthService } from "./auth.service";

@Module({
  controllers: [DeliveryPersonsAuthController],
  providers: [DeliveryPersonsAuthService, DeliveryPersonRefreshTokenGuard],
})
export class DeliveryPersonsAuthModule {}
