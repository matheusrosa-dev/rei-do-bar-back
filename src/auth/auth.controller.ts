import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { SyncDeviceIdDto } from "./dtos/sync-device-id.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("sync-device-id")
  async syncDeviceId(@Body() body: SyncDeviceIdDto, @Res() res: Response) {
    const { isNewDevice, deviceId } = await this.authService.syncDeviceId(body);

    res.cookie("device_id", deviceId, {
      httpOnly: true,
      secure: true,
    });

    if (isNewDevice) {
      return res.status(201).json({ deviceId });
    }

    return res.status(204).send();
  }
}
