import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";
import { PushNotificationDto } from "./dtos";
import { NotificationTarget } from "./helpers";

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private expoNotificationsService: ExpoNotificationsService,
  ) {}

  async pushNotification(dto: PushNotificationDto) {
    let tokens: string[] = [];

    if (dto.target === NotificationTarget.ALL) {
      const customers = await this.prisma.customer.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        select: {
          pushTokens: true,
        },
      });

      tokens = customers.flatMap((customer) =>
        customer.pushTokens.map((pushToken) => pushToken.token),
      );
    }

    await this.expoNotificationsService.pushNotification({
      title: dto.title,
      description: dto.description,
      tokens,
      action: dto.action,
    });
  }
}
