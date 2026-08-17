import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IAuthConfig } from "@shared/config/env-config.interface";

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor(configService: ConfigService) {
    const authConfig = configService.get<IAuthConfig>("auth")!;

    const jwtRefreshSecret = authConfig.jwtRefreshSecret;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtRefreshSecret,
    });
  }

  validate(payload) {
    return payload;
  }
}
