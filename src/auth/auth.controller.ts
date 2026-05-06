import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

@Controller("auth")
export class AuthController {
  @Post("sync-device-id")
  async syncDeviceId(@Req() req: Request, @Res() res: Response) {
    let deviceId = req.body.deviceId;
    let isNewDevice = false;

    if (!deviceId) {
      deviceId = randomUUID();
      isNewDevice = true;
    }

    res.cookie("device_id", deviceId, {
      httpOnly: true,
      secure: true,
      // TODO: adicionar tempo de expiração
    });

    if (isNewDevice) {
      return res.status(201).json({ deviceId });
    }

    return res.status(204).send();
  }
}
