import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerStorage } from "@nestjs/throttler";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { verifyPassword } from "@shared/helpers/password";
import { hashString } from "@shared/helpers/string";
import { prismaMock } from "@shared/testing/mocks";
import { DeliveryPersonsAuthService } from "../auth.service";

jest.mock("@shared/helpers/password", () => ({
  ...jest.requireActual("@shared/helpers/password"),
  verifyPassword: jest.fn(),
}));

const verifyPasswordMock = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;

const AUTH = {
  deliveryPersonTokenExpirationMinutes: 5,
  deliveryPersonRefreshExpirationMinutes: 240,
};
const RATE_LIMIT = { deliveryPerson: { ttl: 60_000, limit: 5 } };

const IP = "1.2.3.4";
const DELIVERY_PERSON_ID = "delivery-person-id";
const dto = { cpf: "12345678901", password: "senha-do-entregador" };

const activeDeliveryPerson = {
  id: DELIVERY_PERSON_ID,
  isActive: true,
  hashedPassword: "hashed-password",
};

describe("DeliveryPersonsAuthService", () => {
  let service: DeliveryPersonsAuthService;
  let increment: jest.Mock;

  beforeEach(async () => {
    increment = jest.fn().mockResolvedValue({ isBlocked: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryPersonsAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ThrottlerStorage, useValue: { increment } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "auth") return AUTH;
              if (key === "rateLimit") return RATE_LIMIT;
            },
          },
        },
      ],
    }).compile();

    service = module.get<DeliveryPersonsAuthService>(
      DeliveryPersonsAuthService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("login", () => {
    const expectInvalidCredentials = async () =>
      expect(service.login(IP, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.deliveryPersonsAuth.INVALID_CREDENTIALS,
        message: "CPF ou senha inválidos.",
        httpStatus: AppException.HttpStatus.UNAUTHORIZED,
      });

    describe("when the credentials are rejected", () => {
      it("should answer INVALID_CREDENTIALS for an unknown cpf, without hashing", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

        await expectInvalidCredentials();

        expect(verifyPasswordMock).not.toHaveBeenCalled();
        expect(prismaMock.deliveryPersonSession.upsert).not.toHaveBeenCalled();
      });

      it("should answer INVALID_CREDENTIALS for an inactive delivery person, without hashing", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue({
          ...activeDeliveryPerson,
          isActive: false,
        });

        await expectInvalidCredentials();

        expect(verifyPasswordMock).not.toHaveBeenCalled();
        expect(prismaMock.deliveryPersonSession.upsert).not.toHaveBeenCalled();
      });

      it("should answer INVALID_CREDENTIALS when no password was ever assigned, without hashing", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue({
          ...activeDeliveryPerson,
          hashedPassword: null,
        });

        await expectInvalidCredentials();

        expect(verifyPasswordMock).not.toHaveBeenCalled();
        expect(prismaMock.deliveryPersonSession.upsert).not.toHaveBeenCalled();
      });

      it("should answer INVALID_CREDENTIALS for a wrong password", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(
          activeDeliveryPerson,
        );
        verifyPasswordMock.mockResolvedValue(false);

        await expectInvalidCredentials();

        expect(verifyPasswordMock).toHaveBeenCalledWith(
          dto.password,
          activeDeliveryPerson.hashedPassword,
        );
        expect(prismaMock.deliveryPersonSession.upsert).not.toHaveBeenCalled();
      });
    });

    describe("failed-attempt lockout", () => {
      it("should count a failed attempt in the delivery-person bucket, keyed by ip", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

        await expectInvalidCredentials();

        expect(increment).toHaveBeenCalledTimes(1);
        expect(increment).toHaveBeenCalledWith(
          `delivery-person-login:${IP}`,
          RATE_LIMIT.deliveryPerson.ttl,
          RATE_LIMIT.deliveryPerson.limit,
          RATE_LIMIT.deliveryPerson.ttl,
          "delivery-person",
        );
      });

      it("should not count a successful login", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(
          activeDeliveryPerson,
        );
        verifyPasswordMock.mockResolvedValue(true);

        await service.login(IP, dto);

        expect(increment).not.toHaveBeenCalled();
      });

      it("should surface RATE_LIMIT_EXCEEDED instead of INVALID_CREDENTIALS once blocked", async () => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);
        increment.mockResolvedValueOnce({ isBlocked: true });

        await expect(service.login(IP, dto)).rejects.toMatchObject({
          code: AppException.errorCodes.auth.RATE_LIMIT_EXCEEDED,
          httpStatus: AppException.HttpStatus.TOO_MANY_REQUESTS,
        });
      });
    });

    describe("when the credentials are accepted", () => {
      beforeEach(() => {
        prismaMock.deliveryPerson.findUnique.mockResolvedValue(
          activeDeliveryPerson,
        );
        verifyPasswordMock.mockResolvedValue(true);
      });

      it("should return only the token pair, with no hashes or expirations", async () => {
        const result = await service.login(IP, dto);

        expect(Object.keys(result).sort()).toEqual([
          "accessToken",
          "refreshToken",
        ]);
        expect(result.accessToken).not.toBe(result.refreshToken);
      });

      it("should replace any previous session by upserting on the delivery person", async () => {
        await service.login(IP, dto);

        expect(prismaMock.deliveryPersonSession.upsert).toHaveBeenCalledTimes(
          1,
        );
        expect(prismaMock.deliveryPersonSession.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { deliveryPersonId: DELIVERY_PERSON_ID },
          }),
        );
      });

      it("should persist only the hashes of the returned tokens", async () => {
        const result = await service.login(IP, dto);

        const { create, update } =
          prismaMock.deliveryPersonSession.upsert.mock.calls[0][0];

        expect(create).toMatchObject({
          deliveryPersonId: DELIVERY_PERSON_ID,
          hashedAccessToken: hashString(result.accessToken),
          hashedRefreshToken: hashString(result.refreshToken),
        });
        expect(update).toMatchObject({
          hashedAccessToken: hashString(result.accessToken),
          hashedRefreshToken: hashString(result.refreshToken),
        });
        for (const persisted of [create, update]) {
          const serialized = JSON.stringify(persisted);

          expect(serialized).not.toContain(result.accessToken);
          expect(serialized).not.toContain(result.refreshToken);
        }
      });

      it("should derive both expirations from the auth config", async () => {
        const now = new Date("2026-08-16T12:00:00.000Z");
        jest.useFakeTimers().setSystemTime(now);

        try {
          await service.login(IP, dto);

          const { update } =
            prismaMock.deliveryPersonSession.upsert.mock.calls[0][0];

          expect(update.accessTokenExpiresAt).toEqual(
            new Date("2026-08-16T12:05:00.000Z"),
          );
          expect(update.refreshTokenExpiresAt).toEqual(
            new Date("2026-08-16T16:00:00.000Z"),
          );
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });

  describe("refreshTokens", () => {
    const currentSession = {
      id: "session-id",
      hashedRefreshToken: "hashed-refresh-token",
    };

    it("should rotate with a count guard matching the id and the presented hash", async () => {
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.refreshTokens(currentSession);

      expect(prismaMock.deliveryPersonSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: currentSession.id,
            hashedRefreshToken: currentSession.hashedRefreshToken,
          },
        }),
      );
    });

    it("should not look the session up again", async () => {
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.refreshTokens(currentSession);

      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });

    it("should issue a fresh pair whose hashes replace the stored ones", async () => {
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.refreshTokens(currentSession);

      const { data } =
        prismaMock.deliveryPersonSession.updateMany.mock.calls[0][0];

      expect(data.hashedRefreshToken).not.toBe(
        currentSession.hashedRefreshToken,
      );
      expect(data.hashedAccessToken).toBe(hashString(result.accessToken));
      expect(data.hashedRefreshToken).toBe(hashString(result.refreshToken));
    });

    it("should restart both clocks, keeping the refresh window sliding", async () => {
      const now = new Date("2026-08-16T12:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 1,
      });

      try {
        await service.refreshTokens(currentSession);

        const { data } =
          prismaMock.deliveryPersonSession.updateMany.mock.calls[0][0];

        expect(data.accessTokenExpiresAt).toEqual(
          new Date("2026-08-16T12:05:00.000Z"),
        );
        expect(data.refreshTokenExpiresAt).toEqual(
          new Date("2026-08-16T16:00:00.000Z"),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reject a replayed token that matches no row", async () => {
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(service.refreshTokens(currentSession)).rejects.toMatchObject(
        {
          code: AppException.errorCodes.deliveryPersonsAuth
            .INVALID_REFRESH_TOKEN,
          message:
            "Acesso negado. O token de atualização fornecido é inválido.",
          httpStatus: AppException.HttpStatus.UNAUTHORIZED,
        },
      );
    });

    it("should not kill the live session on a replay, since a lost response is the likelier cause", async () => {
      prismaMock.deliveryPersonSession.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(service.refreshTokens(currentSession)).rejects.toThrow();

      expect(
        prismaMock.deliveryPersonSession.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });
});
