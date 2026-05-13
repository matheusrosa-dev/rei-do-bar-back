import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { IAuthConfig } from "@shared/config/env-config.interface";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    const authConfig = configService.get<IAuthConfig>("auth")!;

    const jwtSecret = authConfig.jwtSecret;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
    });
  }

  validate(payload) {
    return payload;
  }
}
