import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsService } from "../notifications.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import type { ICurrentSession } from "@shared/types/jwt";

describe("NotificationsService", () => {
  let service: NotificationsService;

  const session: ICurrentSession = {
    deviceId: "device-123",
    customerId: "customer-123",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("registerToken", () => {
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

  describe("revokeToken", () => {
    it("should delete the session customer push tokens registered for the device", async () => {
      prismaMock.pushToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.revokeToken(session);

      expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
        where: {
          deviceId: session.deviceId,
          customerId: session.customerId,
        },
      });
    });

    it("should not throw when the device has no push token", async () => {
      prismaMock.pushToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.revokeToken(session)).resolves.toBeUndefined();
    });
  });
});
