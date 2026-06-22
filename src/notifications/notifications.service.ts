import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { OrderStatusChangedEvent } from "../admin/orders/events";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { RegisterTokenDto } from "./dtos";
import type { ICurrentSession } from "@shared/types/jwt";
import { NotificationAction } from "@shared/types/notifications";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private expoNotificationsService: ExpoNotificationsService,
  ) {}

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

  @OnEvent(OrderStatusChangedEvent.name)
  async onChangeOrderStatus({ data }: OrderStatusChangedEvent) {
    const { order } = data;
    let title = "";
    let description = "";

    if (order.status === OrderStatus.PREPARING) {
      title = "🍻 Pedido confirmado!";
      description = "Já estamos preparando tudo pra você. 🙌";
    } else if (order.status === OrderStatus.SHIPPED) {
      title = "🛵 Seu pedido saiu para entrega!";
      description = "Já tá a caminho! Fique de olho para receber.";
    } else if (order.status === OrderStatus.DELIVERED) {
      title = "🎉 Pedido entregue!";
      description = "Aproveite! A gente já tá com saudade. Volte sempre 🍻";
    } else if (order.status === OrderStatus.CANCELLED) {
      title = "😕 Pedido cancelado";
      description =
        order.statusReason || "Não foi possível concluir o seu pedido.";
    }

    if (!title || !description) return;

    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: {
          customerId: order.customerId,
        },
        select: {
          token: true,
        },
      });

      if (tokens.length === 0) return;

      await this.expoNotificationsService.pushNotification({
        title,
        description,
        tokens: tokens.map((pushToken) => pushToken.token),
        action: NotificationAction.REDIRECT_TO_ORDERS,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar notificação push do pedido ${order.orderNumber}`,
        error,
      );
    }
  }
}
