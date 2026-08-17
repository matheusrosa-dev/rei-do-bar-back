import { Body, Controller, Ip, Post, UseGuards } from "@nestjs/common";
import { CurrentDeliveryPersonSession } from "@shared/decorators/current-delivery-person-session.decorator";
import { Public } from "@shared/decorators/public.decorator";
import { DeliveryPersonRefreshTokenGuard } from "@shared/guards/delivery-person-refresh-token.guard";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import type { ICurrentDeliveryPersonSession } from "@shared/types/delivery-person";
import { DeliveryPersonsAuthService } from "./auth.service";
import { DeliveryPersonsAuthDto, LoginDto } from "./dtos";

@Controller("delivery-persons/auth")
@Serialize(DeliveryPersonsAuthDto)
@Public()
export class DeliveryPersonsAuthController {
  constructor(private readonly authService: DeliveryPersonsAuthService) {}

  @Post("login")
  login(@Ip() ip: string, @Body() dto: LoginDto) {
    return this.authService.login(ip, dto);
  }

  @Post("refresh")
  @UseGuards(DeliveryPersonRefreshTokenGuard)
  refreshTokens(
    @CurrentDeliveryPersonSession() session: ICurrentDeliveryPersonSession,
  ) {
    return this.authService.refreshTokens(session);
  }
}
