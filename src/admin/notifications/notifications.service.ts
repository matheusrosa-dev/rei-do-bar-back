import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";
import { PushNotificationDto } from "./dtos";
import { NotificationTarget } from "./helpers";

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private expoNotificationsService: ExpoNotificationsService,
  ) {}

  async pushNotification(dto: PushNotificationDto) {
    try {
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
    } catch (error) {
      this.logger.error("Falha ao enviar notificação push em massa", error);
    }
  }
}
