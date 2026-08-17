import { UseGuards, applyDecorators } from "@nestjs/common";
import { DeliveryPersonAccessTokenGuard } from "@shared/guards/delivery-person-access-token.guard";
import { Public } from "./public.decorator";

export const DeliveryPersonAuth = () =>
  applyDecorators(Public(), UseGuards(DeliveryPersonAccessTokenGuard));
