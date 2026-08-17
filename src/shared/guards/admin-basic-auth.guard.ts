import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import { Request } from "express";
import {
  IAdminConfig,
  IRateLimitConfig,
} from "@shared/config/env-config.interface";
import { AppException } from "@shared/exceptions/app.exception";
import { safeCompare } from "@shared/helpers/string";

@Injectable()
export class AdminBasicAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    if (this.hasValidCredentials(request)) return true;

    await this.registerFailedAttempt(request);

    return false;
  }

  private hasValidCredentials(request: Request): boolean {
    const admin = this.configService.get<IAdminConfig>("admin")!;

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Basic ")) return false;

    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf-8",
    );
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return false;

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const usernameMatches = safeCompare(username, admin.username);
    const passwordMatches = safeCompare(password, admin.password);

    return usernameMatches && passwordMatches;
  }

  private async registerFailedAttempt(request: Request): Promise<void> {
    const { admin } = this.configService.get<IRateLimitConfig>("rateLimit")!;
    const key = `admin-login:${request.ip}`;

    const record = await this.storage.increment(
      key,
      admin.ttl,
      admin.limit,
      admin.ttl,
      "admin",
    );

    if (record.isBlocked) {
      throw new AppException(
        AppException.errorCodes.auth.RATE_LIMIT_EXCEEDED,
        "Muitas tentativas. Aguarde um momento e tente novamente.",
        AppException.HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
