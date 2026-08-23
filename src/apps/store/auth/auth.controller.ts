import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  SyncDeviceIdDto,
  LoginOtpCodeDto,
  SendOtpCodeDto,
  AuthDto,
} from "./dtos";
import {
  DeviceThrottle,
  IpThrottle,
} from "@shared/decorators/throttle.decorator";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("auth")
@Serialize(AuthDto)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("sync-device-id")
  @IpThrottle("deviceSync")
  @StoreAuth("basic")
  async syncDeviceId(@Body() body: SyncDeviceIdDto) {
    const { deviceId } = await this.authService.syncDeviceId(body);

    return { deviceId };
  }

  @Post("send-otp-code")
  @DeviceThrottle("otpSend", "otpSendLong")
  @StoreAuth("deviceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendOtpCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: SendOtpCodeDto,
  ) {
    return this.authService.sendOtpCode(session.deviceId!, body);
  }

  @Post("login-otp-code")
  @DeviceThrottle("otpLogin")
  @StoreAuth("deviceId")
  async loginWithOtpCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: LoginOtpCodeDto,
  ) {
    return this.authService.loginWithOtpCode(session.deviceId!, body);
  }

  @Post("refresh")
  @StoreAuth("refreshToken")
  async refreshTokens(@CurrentSession() session: ICurrentSession) {
    return this.authService.refreshTokens({
      customerId: session.customerId!,
      token: session.token!,
    });
  }

  @Post("logout")
  @StoreAuth("refreshToken")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentSession() session: ICurrentSession) {
    await this.authService.logout(session);
  }
}
