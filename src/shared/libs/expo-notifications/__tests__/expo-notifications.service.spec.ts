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
    // clearMocks does not undo spies, so a stubbed implementation would leak
    // into the next test.
    jest.restoreAllMocks();
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

      const result = await service.pushNotification({
        tokens: ["invalid"],
        title: "title",
        description: "description",
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ unregisteredTokens: [] });
    });

    it("should report the tokens the tickets rejected as unregistered", async () => {
      sendSpy.mockResolvedValueOnce([
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered" },
        },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: ["token-1"] });
    });

    it("should report no unregistered token when every ticket succeeds", async () => {
      sendSpy.mockResolvedValueOnce([
        { status: "ok", id: "receipt-1" },
        { status: "ok", id: "receipt-2" },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1", "token-2"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: [] });
    });

    it("should not report tokens rejected for a reason other than DeviceNotRegistered", async () => {
      sendSpy.mockResolvedValueOnce([
        {
          status: "error",
          message: "too many requests",
          details: { error: "MessageRateExceeded" },
        },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: [] });
    });

    it("should match each ticket to the token at the same position", async () => {
      sendSpy.mockResolvedValueOnce([
        { status: "ok", id: "receipt-1" },
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered" },
        },
        { status: "ok", id: "receipt-3" },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1", "token-2", "token-3"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: ["token-2"] });
    });

    it("should not report a token when the ticket carries no error details", async () => {
      sendSpy.mockResolvedValueOnce([
        { status: "error", message: "unknown failure" },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: [] });
    });

    it("should prefer the token the ticket echoes back", async () => {
      sendSpy.mockResolvedValueOnce([
        {
          status: "error",
          message: "not registered",
          details: {
            error: "DeviceNotRegistered",
            expoPushToken: "token-from-ticket",
          },
        },
      ]);

      const result = await service.pushNotification({
        tokens: ["token-1"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: ["token-from-ticket"] });
    });

    it("should restart the ticket correlation on every chunk", async () => {
      jest
        .spyOn((service as any).expo, "chunkPushNotifications")
        .mockImplementation((messages: any) => [
          messages.slice(0, 2),
          messages.slice(2),
        ]);

      sendSpy
        .mockResolvedValueOnce([
          { status: "ok", id: "receipt-1" },
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ])
        .mockResolvedValueOnce([
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
          { status: "ok", id: "receipt-4" },
        ]);

      const result = await service.pushNotification({
        tokens: ["token-1", "token-2", "token-3", "token-4"],
        title: "title",
        description: "description",
      });

      expect(result).toEqual({ unregisteredTokens: ["token-2", "token-3"] });
    });
  });
});
