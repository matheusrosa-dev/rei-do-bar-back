/** biome-ignore-all lint/suspicious/noExplicitAny: <some tests needs to use any> */
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Expo from "expo-server-sdk";
import { NotificationsService } from "../notifications.service";

jest.mock("expo-server-sdk", () => {
  const isExpoPushToken = jest.fn(() => true);
  const chunkPushNotifications = jest.fn((messages) => [messages]);
  const sendPushNotificationsAsync = jest.fn().mockResolvedValue([]);

  class ExpoMock {
    chunkPushNotifications = chunkPushNotifications;
    sendPushNotificationsAsync = sendPushNotificationsAsync;
    static isExpoPushToken = isExpoPushToken;
  }

  return { __esModule: true, default: ExpoMock };
});
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { OrderStatusChangedEvent } from "../../admin/orders/events";
import type { ICurrentSession } from "@shared/types/jwt";

const buildOrder = (
  overrides: Partial<OrderStatusChangedEvent["order"]> = {},
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
  let sendSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "expo") return { accessToken: "test-access-token" };
            },
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    sendSpy = jest.spyOn((service as any).expo, "sendPushNotificationsAsync");
  });

  afterEach(() => {
    jest.spyOn(Expo, "isExpoPushToken").mockReturnValue(true);
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
      const pushNotificationSpy = jest.spyOn(
        service as any,
        "pushNotification",
      );

      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent(buildOrder({ status })),
      );

      expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
        where: { customerId: "customer-123" },
        select: { token: true },
      });
      expect(pushNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ["token-1"],
          title: expect.any(String),
          description: expect.any(String),
          payload: { action: "REDIRECT_TO_ORDERS" },
        }),
      );
    });

    it("should use the statusReason as description when the order is cancelled", async () => {
      const pushNotificationSpy = jest.spyOn(
        service as any,
        "pushNotification",
      );

      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent(
          buildOrder({
            status: OrderStatus.CANCELLED,
            statusReason: "Sem estoque",
          }),
        ),
      );

      expect(pushNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Sem estoque" }),
      );
    });

    it("should use a fallback description when a cancelled order has no statusReason", async () => {
      const pushNotificationSpy = jest.spyOn(
        service as any,
        "pushNotification",
      );

      prismaMock.pushToken.findMany.mockResolvedValue([{ token: "token-1" }]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent(
          buildOrder({ status: OrderStatus.CANCELLED, statusReason: null }),
        ),
      );

      expect(pushNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Não foi possível concluir o seu pedido.",
        }),
      );
    });

    it("should do nothing when the status has no notification configured", async () => {
      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent(
          buildOrder({ status: OrderStatus.PENDING }),
        ),
      );

      expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should not send anything when the customer has no push tokens", async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([]);

      await service.onChangeOrderStatus(
        new OrderStatusChangedEvent(buildOrder()),
      );

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should swallow errors when sending the notification fails", async () => {
      const loggerSpy = jest
        .spyOn((service as any).logger, "error")
        .mockImplementation(() => {});

      prismaMock.pushToken.findMany.mockRejectedValue(new Error("db down"));

      await expect(
        service.onChangeOrderStatus(new OrderStatusChangedEvent(buildOrder())),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe("pushNotification", () => {
    it("should send chunked messages built from valid tokens", async () => {
      await (service as any).pushNotification({
        tokens: ["token-1", "token-2"],
        title: "title",
        description: "description",
      });

      expect(sendSpy).toHaveBeenCalled();
      const sentMessages = sendSpy.mock.calls.flatMap(([chunk]) => chunk);
      expect(sentMessages).toEqual([
        expect.objectContaining({
          to: "token-1",
          title: "title",
          body: "description",
        }),
        expect.objectContaining({
          to: "token-2",
          title: "title",
          body: "description",
        }),
      ]);
    });

    it("should filter out tokens that are not valid Expo push tokens", async () => {
      jest
        .spyOn(Expo, "isExpoPushToken")
        .mockImplementation((token) => token === "token-1");

      await (service as any).pushNotification({
        tokens: ["token-1", "invalid"],
        title: "title",
        description: "description",
      });

      const sentMessages = sendSpy.mock.calls.flatMap(([chunk]) => chunk);
      expect(sentMessages).toEqual([
        expect.objectContaining({ to: "token-1" }),
      ]);
    });

    it("should not send anything when no token is valid", async () => {
      jest.spyOn(Expo, "isExpoPushToken").mockReturnValue(false);

      await (service as any).pushNotification({
        tokens: ["invalid"],
        title: "title",
        description: "description",
      });

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });
});
