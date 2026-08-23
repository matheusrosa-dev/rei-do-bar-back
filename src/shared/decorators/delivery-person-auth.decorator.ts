import { UseGuards } from "@nestjs/common";
import { DeliveryPersonAccessTokenGuard } from "@shared/guards/delivery-persons/delivery-person-access-token.guard";
import { DeliveryPersonBasicAuthGuard } from "@shared/guards/delivery-persons/delivery-person-basic-auth.guard";
import { DeliveryPersonRefreshTokenGuard } from "@shared/guards/delivery-persons/delivery-person-refresh-token.guard";

const DELIVERY_PERSON_GUARDS = {
  basic: [DeliveryPersonBasicAuthGuard],
  accessToken: [DeliveryPersonBasicAuthGuard, DeliveryPersonAccessTokenGuard],
  refreshToken: [DeliveryPersonBasicAuthGuard, DeliveryPersonRefreshTokenGuard],
} as const;

export const DeliveryPersonAuth = (type: keyof typeof DELIVERY_PERSON_GUARDS) =>
  UseGuards(...DELIVERY_PERSON_GUARDS[type]);
