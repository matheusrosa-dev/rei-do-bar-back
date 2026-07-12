import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { OrderStatus, Prisma } from "@shared/database/prisma/generated/client";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";
import { PushNotificationDto } from "./dtos";
import { getInactivityCutoff, NotificationTarget } from "./helpers";

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private expoNotificationsService: ExpoNotificationsService,
  ) {}

  async pushNotification(dto: PushNotificationDto) {
    try {
      const targetWhere = await this.resolveTargetWhere(dto.target);

      const customers = await this.prisma.customer.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushTokens: { some: {} },
          ...targetWhere,
        },
        select: {
          pushTokens: true,
        },
      });

      const tokens = customers.flatMap((customer) =>
        customer.pushTokens.map((pushToken) => pushToken.token),
      );

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

  private async resolveTargetWhere(
    target: NotificationTarget,
  ): Promise<Prisma.CustomerWhereInput> {
    switch (target) {
      case NotificationTarget.ALL:
        return {};
      case NotificationTarget.NO_ORDERS:
        return {
          orders: { none: { status: { not: OrderStatus.CANCELLED } } },
        };
      case NotificationTarget.ABANDONED_CART:
        return { cart: { is: { items: { some: {} } } } };
      case NotificationTarget.INACTIVE_30_DAYS:
        return {
          AND: [
            { orders: { some: { status: { not: OrderStatus.CANCELLED } } } },
            {
              orders: {
                none: {
                  status: { not: OrderStatus.CANCELLED },
                  createdAt: { gte: getInactivityCutoff() },
                },
              },
            },
          ],
        };
      case NotificationTarget.SINGLE_ORDER: {
        const groups = await this.prisma.order.groupBy({
          by: ["customerId"],
          where: { status: OrderStatus.DELIVERED },
          having: { customerId: { _count: { equals: 1 } } },
        });

        return { id: { in: groups.map((group) => group.customerId) } };
      }
    }
  }
}
