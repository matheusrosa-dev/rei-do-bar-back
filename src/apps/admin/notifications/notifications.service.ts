import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { OrderStatus, Prisma } from "@shared/database/prisma/generated/client";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";
import { FindAllNotificationsDto, PushNotificationDto } from "./dtos";
import { getInactivityCutoff } from "./helpers";
import {
  NotificationStatus,
  NotificationTarget,
} from "@shared/database/prisma/generated/enums";

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private expoNotificationsService: ExpoNotificationsService,
  ) {}

  async findAll(dto: FindAllNotificationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};

    if (dto.target?.length) where.target = { in: dto.target };
    if (dto.status?.length) where.status = { in: dto.status };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async pushNotification(dto: PushNotificationDto) {
    let customersCount = 0;
    let status: NotificationStatus = NotificationStatus.SENT;

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

      customersCount = customers.length;

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
      status = NotificationStatus.FAILED;
      this.logger.error("Falha ao enviar notificação push em massa", error);
    }

    try {
      await this.prisma.notification.create({
        data: {
          target: dto.target,
          title: dto.title,
          description: dto.description,
          action: dto.action,
          status,
          customersCount,
        },
      });
    } catch (error) {
      this.logger.error("Falha ao registrar a notificação push", error);
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
