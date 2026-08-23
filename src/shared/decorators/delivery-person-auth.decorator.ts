import { UseGuards } from "@nestjs/common";
import { DeliveryPersonAccessTokenGuard } from "@shared/guards/delivery-persons/delivery-person-access-token.guard";

export const DeliveryPersonAuth = () =>
  UseGuards(DeliveryPersonAccessTokenGuard);
