import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class DeviceIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();

    const deviceId = request.headers["x-device-id"];

    if (typeof deviceId !== "string") return false;

    return UUID_REGEX.test(deviceId);
  }
}
