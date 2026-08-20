import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IExpoConfig } from "@shared/config/env-config.interface";
import { NotificationAction } from "@shared/database/prisma/generated/enums";
import Expo, { ExpoPushMessage } from "expo-server-sdk";

@Injectable()
export class ExpoNotificationsService {
  private readonly expo: Expo;

  constructor(configService: ConfigService) {
    const expoConfig = configService.get<IExpoConfig>("expo")!;

    this.expo = new Expo({
      accessToken: expoConfig.accessToken,
    });
  }

  async pushNotification(props: {
    tokens: string[];
    title: string;
    description: string;
    payload?: Record<string, unknown>;
    action?: NotificationAction;
  }) {
    const validTokens = props.tokens.filter((token) =>
      Expo.isExpoPushToken(token),
    );

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      title: props.title,
      body: props.description,
      data: {
        ...props.payload,

        ...(props?.action && {
          action: props.action,
        }),
      },

      priority: "high",
      interruptionLevel: "active",
    }));

    if (messages.length === 0) {
      return;
    }

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      await this.expo.sendPushNotificationsAsync(chunk);
    }
  }
}
