import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";
import { IExpoConfig } from "@shared/config/env-config.interface";
import Expo, { ExpoPushMessage } from "expo-server-sdk";
import { OrderStatusChangedEvent } from "../admin/orders/events";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { RegisterTokenDto } from "./dtos";
import type { ICurrentSession } from "@shared/types/jwt";

enum NotificationAction {
  REDIRECT_TO_ORDERS = "REDIRECT_TO_ORDERS",
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo: Expo;

  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const expoConfig = configService.get<IExpoConfig>("expo")!;

    this.expo = new Expo({
      accessToken: expoConfig.accessToken,
    });
  }

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

  private async pushNotification(props: {
    tokens: string[];
    title: string;
    description: string;
    payload?: Record<string, unknown>;
  }) {
    const messages = props.tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map(
        (token) =>
          ({
            to: token,
            title: props.title,
            body: props.description,
            data: props.payload,

            priority: "high",
            interruptionLevel: "active",
          }) as ExpoPushMessage,
      );

    if (messages.length === 0) {
      return;
    }

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      await this.expo.sendPushNotificationsAsync(chunk);
    }
  }

  @OnEvent(OrderStatusChangedEvent.name)
  async onChangeOrderStatus({ order }: OrderStatusChangedEvent) {
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

      await this.pushNotification({
        title,
        description,
        tokens: tokens.map((pushToken) => pushToken.token),
        payload: {
          action: NotificationAction.REDIRECT_TO_ORDERS,
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar notificação push do pedido ${order.orderNumber}`,
        error,
      );
    }
  }
}
