import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { hashString } from "@shared/helpers/string";
import { Request } from "express";
import "@shared/types/delivery-person";

@Injectable()
export class DeliveryPersonAccessTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    const deliveryPersonId = await this.resolveDeliveryPersonId(request);

    if (!deliveryPersonId) {
      throw new AppException(
        AppException.errorCodes.deliveryPersonsAuth.INVALID_ACCESS_TOKEN,
        "Acesso negado. O token de acesso fornecido é inválido.",
        AppException.HttpStatus.UNAUTHORIZED,
      );
    }

    request.deliveryPerson = { id: deliveryPersonId };

    return true;
  }

  private async resolveDeliveryPersonId(
    request: Request,
  ): Promise<string | null> {
    const token = this.parseBearerToken(request);
    if (!token) return null;

    const session = await this.prisma.deliveryPersonSession.findUnique({
      where: { hashedAccessToken: hashString(token) },
      select: {
        accessTokenExpiresAt: true,
        deliveryPerson: { select: { id: true, isActive: true } },
      },
    });

    if (!session) return null;
    if (session.accessTokenExpiresAt <= new Date()) return null;

    // O admin revoga apagando a sessão, mas a checagem a cada requisição é a
    // segunda linha de defesa: um entregador desativado perde o acesso mesmo
    // que uma sessão sobreviva.
    if (!session.deliveryPerson.isActive) return null;

    return session.deliveryPerson.id;
  }

  private parseBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;

    return authorization.slice(7) || null;
  }
}
