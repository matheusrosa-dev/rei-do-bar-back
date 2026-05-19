import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public } from "@shared/decorators/public.decorator";
import {
  SyncDeviceIdDto,
  LoginOtpCodeDto,
  SendOtpCodeDto,
  AuthDto,
} from "./dtos";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { RefreshTokenGuard } from "@shared/guards/refresh-token.guard";
import type { ICurrentSession } from "@shared/types/jwt";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("auth")
@Serialize(AuthDto)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("sync-device-id")
  async syncDeviceId(@Body() body: SyncDeviceIdDto) {
    const { deviceId } = await this.authService.syncDeviceId(body);

    return { deviceId };
  }

  @Post("send-otp-code")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendOtpCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: SendOtpCodeDto,
  ) {
    return this.authService.sendOtpCode(session.deviceId!, body);
  }

  @Post("login-otp-code")
  async loginWithOtpCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: LoginOtpCodeDto,
  ) {
    return this.authService.loginWithOtpCode(session.deviceId!, body);
  }

  @Post("refresh")
  @UseGuards(RefreshTokenGuard)
  async refreshTokens(@CurrentSession() session: ICurrentSession) {
    return this.authService.refreshTokens({
      customerId: session.customerId!,
      token: session.token!,
    });
  }

  @Post("logout")
  @UseGuards(RefreshTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentSession() session: ICurrentSession) {
    await this.authService.logout(session);
  }
}
