/** biome-ignore-all lint/suspicious/noExplicitAny: <some tests needs to use any> */
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Expo from "expo-server-sdk";
import { ExpoNotificationsService } from "../expo-notifications.service";

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

describe("ExpoNotificationsService", () => {
  let service: ExpoNotificationsService;
  let sendSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpoNotificationsService,
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

    service = module.get<ExpoNotificationsService>(ExpoNotificationsService);

    sendSpy = jest.spyOn((service as any).expo, "sendPushNotificationsAsync");
  });

  afterEach(() => {
    jest.spyOn(Expo, "isExpoPushToken").mockReturnValue(true);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
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
