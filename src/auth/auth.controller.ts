import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SyncDeviceIdDto } from "./dtos/sync-device-id.dto";
import { Public } from "@shared/decorators/public.decorator";
import { LoginDto } from "./dtos";
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

  @Post("login")
  async login(
    @CurrentSession() session: ICurrentSession,
    @Body() body: LoginDto,
  ) {
    return this.authService.login(session.deviceId, body);
  }
}
