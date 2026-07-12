import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { ExpoNotificationsService } from "@shared/libs/expo-notifications/expo-notifications.service";
import { AdminNotificationsService } from "../notifications.service";
import { NotificationTarget } from "../helpers";

jest.mock("expo-server-sdk", () => ({
  __esModule: true,
  default: class ExpoMock {
    static isExpoPushToken = jest.fn(() => true);
  },
}));

const expoNotificationsServiceMock = {
  pushNotification: jest.fn(),
};

describe("AdminNotificationsService", () => {
  let service: AdminNotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ExpoNotificationsService,
          useValue: expoNotificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminNotificationsService>(AdminNotificationsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("pushNotification", () => {
    const dto = {
      title: "Título",
      description: "Descrição",
    };

    it("should send to all active customers with a push token for ALL", async () => {
      prismaMock.customer.findMany.mockResolvedValue([
        { pushTokens: [{ token: "token-1" }, { token: "token-2" }] },
        { pushTokens: [{ token: "token-3" }] },
      ]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.ALL,
      });

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          deletedAt: null,
          pushTokens: { some: {} },
        },
        select: { pushTokens: true },
      });
      expect(
        expoNotificationsServiceMock.pushNotification,
      ).toHaveBeenCalledWith({
        title: dto.title,
        description: dto.description,
        tokens: ["token-1", "token-2", "token-3"],
        action: undefined,
      });
    });

    it("should filter customers without any non-cancelled order for NO_ORDERS", async () => {
      prismaMock.customer.findMany.mockResolvedValue([]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.NO_ORDERS,
      });

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          orders: { none: { status: { not: "CANCELLED" } } },
        }),
        select: { pushTokens: true },
      });
    });

    it("should filter customers with items in their cart for ABANDONED_CART", async () => {
      prismaMock.customer.findMany.mockResolvedValue([]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.ABANDONED_CART,
      });

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          cart: { is: { items: { some: {} } } },
        }),
        select: { pushTokens: true },
      });
    });

    it("should filter customers with no recent orders for INACTIVE_30_DAYS", async () => {
      prismaMock.customer.findMany.mockResolvedValue([]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.INACTIVE_30_DAYS,
      });

      const call = prismaMock.customer.findMany.mock.calls[0][0];
      expect(call.where.AND).toEqual([
        { orders: { some: { status: { not: "CANCELLED" } } } },
        {
          orders: {
            none: {
              status: { not: "CANCELLED" },
              createdAt: { gte: expect.any(Date) },
            },
          },
        },
      ]);
    });

    it("should resolve customer ids with exactly one delivered order for SINGLE_ORDER", async () => {
      prismaMock.order.groupBy.mockResolvedValue([
        { customerId: "customer-1" },
        { customerId: "customer-2" },
      ]);
      prismaMock.customer.findMany.mockResolvedValue([]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.SINGLE_ORDER,
      });

      expect(prismaMock.order.groupBy).toHaveBeenCalledWith({
        by: ["customerId"],
        where: { status: "DELIVERED" },
        having: { customerId: { _count: { equals: 1 } } },
      });
      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { in: ["customer-1", "customer-2"] },
        }),
        select: { pushTokens: true },
      });
    });

    it("should resolve to an empty id list when no customer has exactly one delivered order", async () => {
      prismaMock.order.groupBy.mockResolvedValue([]);
      prismaMock.customer.findMany.mockResolvedValue([]);

      await service.pushNotification({
        ...dto,
        target: NotificationTarget.SINGLE_ORDER,
      });

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { in: [] } }),
        select: { pushTokens: true },
      });
      expect(
        expoNotificationsServiceMock.pushNotification,
      ).toHaveBeenCalledWith(expect.objectContaining({ tokens: [] }));
    });

    it("should log and not throw when sending fails", async () => {
      const error = new Error("db error");
      prismaMock.customer.findMany.mockRejectedValue(error);
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      await expect(
        service.pushNotification({ ...dto, target: NotificationTarget.ALL }),
      ).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Falha ao enviar notificação push em massa",
        error,
      );
    });
  });
});
