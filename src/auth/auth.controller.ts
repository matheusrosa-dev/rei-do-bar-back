import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SyncDeviceIdDto } from "./dtos/sync-device-id.dto";
import { Public } from "@shared/decorators/public.decorator";
import { SendVerificationCodeDto, VerifyCodeDto } from "./dtos";
import {
  CurrentSession,
  type ICurrentSession,
} from "@shared/decorators/current-session.decorator";

@Controller("auth")
// TODO: adicionar serializer
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("sync-device-id")
  async syncDeviceId(@Body() body: SyncDeviceIdDto) {
    const { deviceId } = await this.authService.syncDeviceId(body);

    return { deviceId };
  }

  @Post("send-verification-code")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendVerificationCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: SendVerificationCodeDto,
  ) {
    return this.authService.sendVerificationCode(session.deviceId, body);
  }

  @Post("verify-code")
  @HttpCode(HttpStatus.NO_CONTENT)
  async loginWithCode(
    @CurrentSession() session: ICurrentSession,
    @Body() body: VerifyCodeDto,
  ) {
    return this.authService.verifyCode(session.deviceId, body);
  }
}
