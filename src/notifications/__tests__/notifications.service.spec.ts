/** biome-ignore-all lint/suspicious/noExplicitAny: <some tests needs to use any> */
import { Test, TestingModule } from "@nestjs/testing";

jest.mock("expo-server-sdk", () => {
  class ExpoMock {
    chunkPushNotifications = jest.fn((messages: unknown) => [messages]);
    sendPushNotificationsAsync = jest.fn().mockResolvedValue([]);
    static isExpoPushToken = jest.fn(() => true);
  }
  return { __esModule: true, default: ExpoMock };
});

import { NotificationsService } from "../notifications.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { OrderStatusChangedEvent } from "../../admin/orders/events";
import type { ICurrentSession } from "@shared/types/jwt";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";

const buildOrder = (
  overrides: Partial<OrderStatusChangedEvent["data"]["order"]> = {},
) => ({
  id: "order-id",
  customerId: "customer-123",
  orderNumber: 1000,
  status: OrderStatus.PREPARING,
  statusReason: null,
  ...overrides,
});

describe("NotificationsService", () => {
  let service: NotificationsService;
  let expoNotificationsService: { pushNotification: jest.Mock };

  beforeEach(async () => {
    expoNotificationsService = {
      pushNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ExpoNotificationsService,
          useValue: expoNotificationsService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("registerToken", () => {
    const session: ICurrentSession = {
      deviceId: "device-123",
      customerId: "customer-123",
    };

    it("should upsert the push token with the session device and customer", async () => {
      prismaMock.pushToken.upsert.mockResolvedValue({});

      await service.registerToken(session, { token: "ExponentPushToken[abc]" });

      expect(prismaMock.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: "ExponentPushToken[abc]" },
        create: {
          token: "ExponentPushToken[abc]",
          deviceId: session.deviceId,
          customerId: session.customerId,
        },
        update: {
          deviceId: session.deviceId,
          customerId: session.customerId,
        },
      });
    });
  });

  describe("onChangeOrderStatus", () => {
    it.each([
      OrderStatus.PREPARING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])("should send a push notification when status is %s", async (status) => {
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent({ order: buildOrder({ status }) }),
      );

      expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
        where: { customerId: "customer-123" },
        select: { token: true },
      });
      expect(expoNotificationsService.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ["token-1"],
          title: expect.any(String),
          description: expect.any(String),
          action: "REDIRECT_TO_ORDERS",
        }),
      );
    });

    it("should use the statusReason as description when the order is cancelled", async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent({
          order: buildOrder({
            status: OrderStatus.CANCELLED,
            statusReason: "Sem estoque",
          }),
        }),
      );

      expect(expoNotificationsService.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Sem estoque" }),
      );
    });

    it("should use a fallback description when a cancelled order has no statusReason", async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent({
          order: buildOrder({
            status: OrderStatus.CANCELLED,
            statusReason: null,
          }),
        }),
      );

      expect(expoNotificationsService.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Não foi possível concluir o seu pedido.",
        }),
      );
    });

    it("should do nothing when the status has no notification configured", async () => {
      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent({
          order: buildOrder({ status: OrderStatus.PENDING }),
        }),
      );

      expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
      expect(expoNotificationsService.pushNotification).not.toHaveBeenCalled();
    });

    it("should not send anything when the customer has no push tokens", async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent({ order: buildOrder() }),
      );

      expect(expoNotificationsService.pushNotification).not.toHaveBeenCalled();
    });

    it("should swallow errors when sending the notification fails", async () => {
      const loggerSpy = jest
        .spyOn((service as any).logger, "error")
        .mockImplementation(() => {});

      prismaMock.pushToken.findMany.mockRejectedValue(new Error("db down"));

      await expect(
        service.onChangeOrderStatus(
          new OrderStatusChangedEvent({ order: buildOrder() }),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
