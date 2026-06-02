import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { IAdminConfig } from "@shared/config/env-config.interface";

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const admin = this.configService.get<IAdminConfig>("admin")!;
    const request: Request = context.switchToHttp().getRequest();

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Basic ")) return false;

    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf-8",
    );
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return false;

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    return username === admin.username && password === admin.password;
  }
}
