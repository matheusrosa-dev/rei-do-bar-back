import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SyncDeviceIdDto } from "./dtos/sync-device-id.dto";
import { Public } from "@shared/decorators/public.decorator";
import { LoginWithCodeDto, VerifyPhoneDto } from "./dtos";
import {
  CurrentSession,
  type ICurrentSession,
} from "@shared/decorators/current-session.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("sync-device-id")
  async syncDeviceId(@Body() body: SyncDeviceIdDto) {
    const { deviceId } = await this.authService.syncDeviceId(body);

    return { deviceId };
  }

  @Post("verify-customer-phone")
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyCustomerPhone(
    @CurrentSession() session: ICurrentSession,
    @Body() body: VerifyPhoneDto,
  ) {
    return this.authService.verifyPhone(session.deviceId, body);
  }

  @Post("login-with-code")
  @HttpCode(HttpStatus.NO_CONTENT)
  async loginWithCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: LoginWithCodeDto,
  ) {
    return this.authService.loginWithCode(session.deviceId, body);
  }
}
