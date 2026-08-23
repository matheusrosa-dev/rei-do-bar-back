import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { IDeliveryPersonConfig } from "@shared/config/env-config.interface";
import { safeCompare } from "@shared/helpers/string";

@Injectable()
export class DeliveryPersonBasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
    const deliveryPerson =
      this.configService.get<IDeliveryPersonConfig>("deliveryPerson")!;

    const authorization = request.headers["x-delivery-person-authorization"];
    if (typeof authorization !== "string") return false;
    if (!authorization.startsWith("Basic ")) return false;

    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf-8",
    );
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return false;

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const usernameMatches = safeCompare(username, deliveryPerson.username);
    const passwordMatches = safeCompare(password, deliveryPerson.password);

    return usernameMatches && passwordMatches;
  }
}
