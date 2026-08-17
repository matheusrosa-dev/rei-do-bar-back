import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import {
  IAuthConfig,
  IRateLimitConfig,
} from "@shared/config/env-config.interface";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { generateOpaqueToken } from "@shared/helpers/opaque-token";
import { verifyPassword } from "@shared/helpers/password";
import { ICurrentDeliveryPersonSession } from "@shared/types/delivery-person";
import { LoginDto } from "./dtos";

@Injectable()
export class DeliveryPersonsAuthService {
  private readonly authConfig: IAuthConfig;
  private readonly rateLimitConfig: IRateLimitConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    configService: ConfigService,
  ) {
    this.authConfig = configService.get<IAuthConfig>("auth")!;
    this.rateLimitConfig = configService.get<IRateLimitConfig>("rateLimit")!;
  }

  async login(ip: string, dto: LoginDto) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { cpf: dto.cpf },
      select: { id: true, isActive: true, hashedPassword: true },
    });

    const hashedPassword = deliveryPerson?.isActive
      ? deliveryPerson.hashedPassword
      : null;

    const passwordMatches =
      !!hashedPassword && (await verifyPassword(dto.password, hashedPassword));

    if (!passwordMatches) {
      await this.registerFailedAttempt(ip);

      throw new AppException(
        AppException.errorCodes.deliveryPersonsAuth.INVALID_CREDENTIALS,
        "CPF ou senha inválidos.",
        AppException.HttpStatus.UNAUTHORIZED,
      );
    }

    const session = this.generateSessionTokens();

    await this.prisma.deliveryPersonSession.upsert({
      where: { deliveryPersonId: deliveryPerson!.id },
      create: {
        deliveryPersonId: deliveryPerson!.id,
        ...session.persisted,
      },
      update: session.persisted,
    });

    return session.tokens;
  }

  async refreshTokens(currentSession: ICurrentDeliveryPersonSession) {
    const session = this.generateSessionTokens();

    const { count } = await this.prisma.deliveryPersonSession.updateMany({
      where: {
        id: currentSession.id,
        hashedRefreshToken: currentSession.hashedRefreshToken,
      },
      data: session.persisted,
    });

    if (count === 0) {
      throw this.invalidRefreshToken();
    }

    return session.tokens;
  }

  private generateSessionTokens() {
    const {
      deliveryPersonTokenExpirationMinutes,
      deliveryPersonRefreshExpirationMinutes,
    } = this.authConfig;

    const accessToken = generateOpaqueToken();
    const refreshToken = generateOpaqueToken();
    const now = Date.now();

    return {
      tokens: {
        accessToken: accessToken.token,
        refreshToken: refreshToken.token,
      },
      persisted: {
        hashedAccessToken: accessToken.hashedToken,
        hashedRefreshToken: refreshToken.hashedToken,
        accessTokenExpiresAt: new Date(
          now + deliveryPersonTokenExpirationMinutes * 60 * 1000,
        ),
        refreshTokenExpiresAt: new Date(
          now + deliveryPersonRefreshExpirationMinutes * 60 * 1000,
        ),
      },
    };
  }

  private invalidRefreshToken() {
    return new AppException(
      AppException.errorCodes.deliveryPersonsAuth.INVALID_REFRESH_TOKEN,
      "Acesso negado. O token de atualização fornecido é inválido.",
      AppException.HttpStatus.UNAUTHORIZED,
    );
  }

  private async registerFailedAttempt(ip: string): Promise<void> {
    const { deliveryPerson } = this.rateLimitConfig;
    const key = `delivery-person-login:${ip}`;

    const record = await this.storage.increment(
      key,
      deliveryPerson.ttl,
      deliveryPerson.limit,
      deliveryPerson.ttl,
      "delivery-person",
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
