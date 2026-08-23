import { Body, Controller, Ip, Post } from "@nestjs/common";
import { CurrentDeliveryPersonSession } from "@shared/decorators/current-delivery-person-session.decorator";
import { DeliveryPersonAuth } from "@shared/decorators/delivery-person-auth.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import type { ICurrentDeliveryPersonSession } from "@shared/types/delivery-person";
import { DeliveryPersonsAuthService } from "./auth.service";
import { DeliveryPersonsAuthDto, LoginDto } from "./dtos";

@Controller("delivery-persons/auth")
@Serialize(DeliveryPersonsAuthDto)
export class DeliveryPersonsAuthController {
  constructor(private readonly authService: DeliveryPersonsAuthService) {}

  @Post("login")
  @DeliveryPersonAuth("basic")
  login(@Ip() ip: string, @Body() dto: LoginDto) {
    return this.authService.login(ip, dto);
  }

  @Post("refresh")
  @DeliveryPersonAuth("refreshToken")
  refreshTokens(
    @CurrentDeliveryPersonSession() session: ICurrentDeliveryPersonSession,
  ) {
    return this.authService.refreshTokens(session);
  }
}
