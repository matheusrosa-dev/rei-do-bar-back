import { ExecutionContext } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { hashString } from "@shared/helpers/string";
import { prismaMock } from "@shared/testing/mocks";
import { Request } from "express";
import { DeliveryPersonAccessTokenGuard } from "../delivery-person-access-token.guard";

const TOKEN = "opaque-access-token";
const DELIVERY_PERSON_ID = "delivery-person-id";

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
  overrides?: Partial<{ accessTokenExpiresAt: Date; isActive: boolean }>,
) => ({
  accessTokenExpiresAt:
    overrides?.accessTokenExpiresAt ?? new Date(Date.now() + 60_000),
  deliveryPerson: {
    id: DELIVERY_PERSON_ID,
    isActive: overrides?.isActive ?? true,
  },
});

const expectInvalidAccessToken = async (context: ExecutionContext) => {
  const guard = new DeliveryPersonAccessTokenGuard(
    prismaMock as unknown as PrismaService,
  );

  await expect(guard.canActivate(context)).rejects.toMatchObject({
    code: AppException.errorCodes.deliveryPersonsAuth.INVALID_ACCESS_TOKEN,
    // Mensagem fixada no contrato da API — o app do entregador reage a ela.
    message: "Acesso negado. O token de acesso fornecido é inválido.",
    httpStatus: AppException.HttpStatus.UNAUTHORIZED,
  });
};

describe("DeliveryPersonAccessTokenGuard", () => {
  let guard: DeliveryPersonAccessTokenGuard;

  beforeEach(() => {
    guard = new DeliveryPersonAccessTokenGuard(
      prismaMock as unknown as PrismaService,
    );
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  describe("when no usable bearer token is presented", () => {
    it("should reject a missing Authorization header without querying the database", async () => {
      const { context } = makeContext(undefined);

      await expectInvalidAccessToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });

    it("should reject a non-Bearer scheme without querying the database", async () => {
      const { context } = makeContext(`Basic ${TOKEN}`);

      await expectInvalidAccessToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty token without querying the database", async () => {
      const { context } = makeContext("Bearer ");

      await expectInvalidAccessToken(context);
      expect(
        prismaMock.deliveryPersonSession.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("when the session cannot be used", () => {
    it("should reject an unknown token", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(null);
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidAccessToken(context);
    });

    it("should reject an expired access token", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession({ accessTokenExpiresAt: new Date(Date.now() - 1) }),
      );
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidAccessToken(context);
    });

    it("should reject a token expiring exactly now", async () => {
      const now = new Date("2026-08-16T12:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
          makeSession({ accessTokenExpiresAt: now }),
        );
        const { context } = makeContext(`Bearer ${TOKEN}`);

        await expectInvalidAccessToken(context);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reject a session whose delivery person is inactive", async () => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession({ isActive: false }),
      );
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await expectInvalidAccessToken(context);
    });
  });

  describe("when the session is valid", () => {
    beforeEach(() => {
      prismaMock.deliveryPersonSession.findUnique.mockResolvedValue(
        makeSession(),
      );
    });

    it("should look the session up by the token hash, never the plaintext", async () => {
      const { context } = makeContext(`Bearer ${TOKEN}`);

      await guard.canActivate(context);

      expect(prismaMock.deliveryPersonSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hashedAccessToken: hashString(TOKEN) },
        }),
      );
    });

    it("should place the delivery person on the request and allow access", async () => {
      const { context, request } = makeContext(`Bearer ${TOKEN}`);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.deliveryPerson).toEqual({ id: DELIVERY_PERSON_ID });
    });
  });
});
