import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { hashString } from "@shared/helpers/string";
import { ICurrentDeliveryPersonSession } from "@shared/types/delivery-person";
import { Request } from "express";

@Injectable()
export class DeliveryPersonRefreshTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    const session = await this.resolveSession(request);

    if (!session) {
      throw new AppException(
        AppException.errorCodes.deliveryPersonsAuth.INVALID_REFRESH_TOKEN,
        "Acesso negado. O token de atualização fornecido é inválido.",
        AppException.HttpStatus.UNAUTHORIZED,
      );
    }

    request.deliveryPersonSession = session;

    return true;
  }

  private async resolveSession(
    request: Request,
  ): Promise<ICurrentDeliveryPersonSession | null> {
    const token = this.parseBearerToken(request);
    if (!token) return null;

    const hashedRefreshToken = hashString(token);

    const session = await this.prisma.deliveryPersonSession.findUnique({
      where: { hashedRefreshToken },
      select: {
        id: true,
        refreshTokenExpiresAt: true,
        deliveryPerson: { select: { isActive: true } },
      },
    });

    if (!session) return null;
    if (session.refreshTokenExpiresAt <= new Date()) return null;

    if (!session.deliveryPerson.isActive) return null;

    return { id: session.id, hashedRefreshToken };
  }

  private parseBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;

    return authorization.slice(7) || null;
  }
}
