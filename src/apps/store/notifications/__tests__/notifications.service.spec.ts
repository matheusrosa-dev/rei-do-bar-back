import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsService } from "../notifications.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import type { ICurrentSession } from "@shared/types/jwt";

describe("NotificationsService", () => {
  let service: NotificationsService;

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
});
