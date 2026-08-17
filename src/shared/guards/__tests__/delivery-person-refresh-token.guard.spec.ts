import { ExecutionContext } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { hashString } from "@shared/helpers/string";
import { prismaMock } from "@shared/testing/mocks";
import { Request } from "express";
import { DeliveryPersonRefreshTokenGuard } from "../delivery-person-refresh-token.guard";

const TOKEN = "opaque-refresh-token";
const SESSION_ID = "session-id";

const makeContext = (authorization?: string) => {
  const request = { headers: { authorization } } as Request;

  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
};

const makeSession = (
  overrides?: Partial<{ refreshTokenExpiresAt: Date; isActive: boolean }>,
) => ({
  id: SESSION_ID,
  refreshTokenExpiresAt:
    overrides?.refreshTokenExpiresAt ?? new Date(Date.now() + 60_000),
  deliveryPerson: { isActive: overrides?.isActive ?? true },
});

const expectInvalidRefreshToken = async (context: ExecutionContext) => {
  const guard = new DeliveryPersonRefreshTokenGuard(
    prismaMock as unknown as PrismaService,
  );

  await expect(guard.canActivate(context)).rejects.toMatchObject({
    code: AppException.errorCodes.deliveryPersonsAuth.INVALID_REFRESH_TOKEN,
    // O serviço de rotação produz este mesmo código; a mensagem é asseverada
    // dos dois lados para que o cliente nunca consiga distinguir as causas.
    message: "Acesso negado. O token de atualização fornecido é inválido.",
    httpStatus: AppException.HttpStatus.UNAUTHORIZED,
  });
};

describe("DeliveryPersonRefreshTokenGuard", () => {
  let guard: DeliveryPersonRefreshTokenGuard;

  beforeEach(() => {
    guard = new DeliveryPersonRefreshTokenGuard(
      prismaMock as unknown as PrismaService,
    );
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  describe("when no usable bearer token is presented", () => {
    it("should reject a missing Authorization header without querying the database", async () => {
      const { context } = makeContext(undefined);

      await expectInvalidRefreshToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });

    it("should reject a non-Bearer scheme without querying the database", async () => {
      const { context } = makeContext(`Basic ${TOKEN}`);

      await expectInvalidRefreshToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty token without querying the database", async () => {
      const { context } = makeContext("Bearer ");

      await expectInvalidRefreshToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("when the session cannot be used", () => {
    it("should reject an unknown token", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(null);
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidRefreshToken(context);
    });

    it("should reject an expired refresh token", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession({ refreshTokenExpiresAt: new Date(Date.now() - 1) }),
      );
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidRefreshToken(context);
    });

    it("should reject a token expiring exactly now", async () => {
      const now = new Date("2026-08-16T12:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
          makeSession({ refreshTokenExpiresAt: now }),
        );
        const { context } = makeContext(`Bearer ${TOKEN}`);

        await expectInvalidRefreshToken(context);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reject a session whose delivery person was deactivated mid-session", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession({ isActive: false }),
      );
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidRefreshToken(context);
    });
  });

  describe("when the session is valid", () => {
    beforeEach(() => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession(),
      );
    });

    it("should look the session up by the refresh token hash, never the plaintext", async () => {
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await guard.canActivate(context);

      expect(prismaMock.deliveryPersonSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hashedRefreshToken: hashString(TOKEN) },
        }),
      );
    });

    it("should hand the service the id and the presented hash, so the rotation stays count-guarded", async () => {
      const { context, request } = makeContext(`Bearer ${TOKEN}`);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.deliveryPersonSession).toEqual({
        id: SESSION_ID,
        hashedRefreshToken: hashString(TOKEN),
      });
    });
  });
});
