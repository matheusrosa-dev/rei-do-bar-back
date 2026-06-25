import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { RegisterTokenDto } from "./dtos";
import type { ICurrentSession } from "@shared/types/jwt";

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async registerToken(session: ICurrentSession, dto: RegisterTokenDto) {
    await this.prisma.pushToken.upsert({
      where: {
        token: dto.token,
      },
      create: {
        token: dto.token,
        deviceId: session.deviceId!,
        customerId: session.customerId!,
      },
      update: {
        deviceId: session.deviceId!,
        customerId: session.customerId!,
      },
    });
  }
}
