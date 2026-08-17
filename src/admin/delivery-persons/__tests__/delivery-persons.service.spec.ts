import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { verifyPassword } from "@shared/helpers/password";
import { DeliveryPersonFactory } from "@shared/testing/factories";
import { prismaMock } from "@shared/testing/mocks";
import { AdminDeliveryPersonsService } from "../delivery-persons.service";

describe("AdminDeliveryPersonsService", () => {
  let service: AdminDeliveryPersonsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDeliveryPersonsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminDeliveryPersonsService>(
      AdminDeliveryPersonsService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createDeliveryPerson", () => {
    const dto = {
      name: "João da Silva",
      phone: "11999999999",
      cpf: "12345678901",
      address: {
        street: "Rua A",
        number: "10",
        neighborhood: "Centro",
        zipCode: "01001000",
      },
    };

    it("should return the nested address shape", async () => {
      prismaMock.deliveryPerson.create.mockResolvedValue(
        DeliveryPersonFactory.createOne({
          addressStreet: dto.address.street,
          addressNumber: dto.address.number,
          addressNeighborhood: dto.address.neighborhood,
          addressZipCode: dto.address.zipCode,
        }),
      );

      const result = await service.createDeliveryPerson(dto);

      expect(result.address).toEqual(dto.address);
      expect(result).not.toHaveProperty("addressStreet");
    });

    it("should translate a unique constraint violation into DELIVERY_PERSON_ALREADY_EXISTS", async () => {
      prismaMock.deliveryPerson.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(service.createDeliveryPerson(dto)).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_ALREADY_EXISTS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });
    });
  });

  describe("updateDeliveryPerson", () => {
    const dto = {
      name: "João da Silva",
      phone: "11999999999",
      cpf: "12345678901",
      address: {
        street: "Rua A",
        number: "10",
        neighborhood: "Centro",
        zipCode: "01001000",
      },
    };

    it("should translate a not-found error into DELIVERY_PERSON_NOT_FOUND", async () => {
      prismaMock.deliveryPerson.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateDeliveryPerson("missing-id", dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should translate a unique constraint violation into DELIVERY_PERSON_ALREADY_EXISTS", async () => {
      prismaMock.deliveryPerson.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateDeliveryPerson("some-id", dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_ALREADY_EXISTS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });
    });
  });

  describe("updateDeliveryPersonPassword", () => {
    const dto = { password: "senha-do-entregador" };

    it("should persist a hash of the password, never the plaintext", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.update.mockResolvedValue(deliveryPerson);

      await service.updateDeliveryPersonPassword(deliveryPerson.id, dto);

      const { data } = prismaMock.deliveryPerson.update.mock.calls[0][0];

      expect(data.hashedPassword).not.toBe(dto.password);
      await expect(
        verifyPassword(dto.password, data.hashedPassword),
      ).resolves.toBe(true);
    });

    it("should revoke the session in the same transaction as the write", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.update.mockResolvedValue(deliveryPerson);

      await service.updateDeliveryPersonPassword(deliveryPerson.id, dto);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      // Ambas as operações precisam ser membros do mesmo array: sem isso, o
      // teste passaria com a escrita e o delete sequenciais e não atômicos.
      expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(prismaMock.deliveryPersonSession.deleteMany).toHaveBeenCalledWith({
        where: { deliveryPersonId: deliveryPerson.id },
      });
    });

    it("should translate a not-found error into DELIVERY_PERSON_NOT_FOUND", async () => {
      prismaMock.deliveryPerson.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateDeliveryPersonPassword("missing-id", dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });
  });

  describe("revokeDeliveryPersonAccess", () => {
    it("should throw DELIVERY_PERSON_NOT_FOUND without deleting anything", async () => {
      prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeDeliveryPersonAccess("missing-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(
        prismaMock.deliveryPersonSession.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it("should delete the session of an existing delivery person", async () => {
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        id: "some-id",
      });
      prismaMock.deliveryPersonSession.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.revokeDeliveryPersonAccess("some-id");

      expect(prismaMock.deliveryPersonSession.deleteMany).toHaveBeenCalledWith({
        where: { deliveryPersonId: "some-id" },
      });
    });

    it("should be idempotent when the delivery person is not logged in", async () => {
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        id: "some-id",
      });
      prismaMock.deliveryPersonSession.deleteMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.revokeDeliveryPersonAccess("some-id"),
      ).resolves.toBeUndefined();
    });
  });

  describe("revokeAllDeliveryPersonsAccess", () => {
    it("should delete every session row, unfiltered", async () => {
      prismaMock.deliveryPersonSession.deleteMany.mockResolvedValue({
        count: 3,
      });

      await service.revokeAllDeliveryPersonsAccess();

      expect(
        prismaMock.deliveryPersonSession.deleteMany,
      ).toHaveBeenCalledWith();
    });

    it("should treat an empty table as a normal no-op, never a 404", async () => {
      prismaMock.deliveryPersonSession.deleteMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.revokeAllDeliveryPersonsAccess(),
      ).resolves.toBeUndefined();
      expect(prismaMock.deliveryPerson.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should sort by ordersCount using the relation count", async () => {
      prismaMock.deliveryPerson.findMany.mockResolvedValue([]);
      prismaMock.deliveryPerson.count.mockResolvedValue(0);

      await service.findAll({ sortKey: "ordersCount", sortDirection: "asc" });

      expect(prismaMock.deliveryPerson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { orders: { _count: "asc" } },
        }),
      );
    });

    it("should map each item with ordersCount and a nested address", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.findMany.mockResolvedValue([
        { ...deliveryPerson, _count: { orders: 3 } },
      ]);
      prismaMock.deliveryPerson.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items[0]).toMatchObject({
        ordersCount: 3,
        address: {
          street: deliveryPerson.addressStreet,
          number: deliveryPerson.addressNumber,
          neighborhood: deliveryPerson.addressNeighborhood,
          zipCode: deliveryPerson.addressZipCode,
        },
      });
    });

    describe("hasSession", () => {
      const listWithSession = async (
        session: { refreshTokenExpiresAt: Date } | null,
      ) => {
        prismaMock.deliveryPerson.findMany.mockResolvedValue([
          {
            ...DeliveryPersonFactory.createOne(),
            _count: { orders: 0 },
            session,
          },
        ]);
        prismaMock.deliveryPerson.count.mockResolvedValue(1);

        const result = await service.findAll({});

        return result.items[0].hasSession;
      };

      it("should be false when there is no session row", async () => {
        await expect(listWithSession(null)).resolves.toBe(false);
      });

      it("should be true while the refresh token is still valid", async () => {
        await expect(
          listWithSession({
            refreshTokenExpiresAt: new Date(Date.now() + 60_000),
          }),
        ).resolves.toBe(true);
      });

      it("should be false for a stale session, since rows are never pruned", async () => {
        await expect(
          listWithSession({
            refreshTokenExpiresAt: new Date(Date.now() - 60_000),
          }),
        ).resolves.toBe(false);
      });

      it("should be false when the refresh token expires exactly now", async () => {
        const now = new Date("2026-08-16T12:00:00.000Z");
        jest.useFakeTimers().setSystemTime(now);

        try {
          await expect(
            listWithSession({ refreshTokenExpiresAt: now }),
          ).resolves.toBe(false);
        } finally {
          jest.useRealTimers();
        }
      });

      it("should select only the refresh expiry, never the token hashes", async () => {
        await listWithSession(null);

        expect(prismaMock.deliveryPerson.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              session: { select: { refreshTokenExpiresAt: true } },
            }),
          }),
        );
      });
    });
  });

  describe("findAllSimple", () => {
    it("should return a flat, unpaginated list ordered by name", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.findMany.mockResolvedValue([deliveryPerson]);

      const result = await service.findAllSimple();

      expect(result).toHaveLength(1);
      expect(prismaMock.deliveryPerson.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      expect(prismaMock.deliveryPerson.count).not.toHaveBeenCalled();
    });

    it("should map each item to the nested address shape", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.findMany.mockResolvedValue([deliveryPerson]);

      const result = await service.findAllSimple();

      expect(result[0]).toMatchObject({
        address: {
          street: deliveryPerson.addressStreet,
          number: deliveryPerson.addressNumber,
          neighborhood: deliveryPerson.addressNeighborhood,
          zipCode: deliveryPerson.addressZipCode,
        },
      });
      expect(result[0]).not.toHaveProperty("addressStreet");
    });
  });

  describe("findDeliveryPersonById", () => {
    it("should throw DELIVERY_PERSON_NOT_FOUND when the record does not exist", async () => {
      prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

      await expect(
        service.findDeliveryPersonById("missing-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should include ordersCount, matching the listing shape", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        ...deliveryPerson,
        _count: { orders: 5 },
      });

      const result = await service.findDeliveryPersonById(deliveryPerson.id);

      expect(result.ordersCount).toBe(5);
    });
  });

  describe("removeDeliveryPerson", () => {
    it("should throw DELIVERY_PERSON_NOT_FOUND when the row lock finds nothing", async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(
        service.removeDeliveryPerson("missing-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.deliveryPerson.delete).not.toHaveBeenCalled();
    });

    it("should throw DELIVERY_PERSON_HAS_ORDERS when orders are linked, without deleting", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(1);

      await expect(
        service.removeDeliveryPerson("some-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_HAS_ORDERS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });

      expect(prismaMock.deliveryPerson.delete).not.toHaveBeenCalled();
    });

    it("should translate a foreign key violation on delete into DELIVERY_PERSON_HAS_ORDERS", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.deliveryPerson.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("fk violation", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(
        service.removeDeliveryPerson("some-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_HAS_ORDERS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });
    });

    it("should delete when the row exists with no linked orders", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.deliveryPerson.delete.mockResolvedValue(
        DeliveryPersonFactory.createOne({ id: "some-id" }),
      );

      await service.removeDeliveryPerson("some-id");

      expect(prismaMock.deliveryPerson.delete).toHaveBeenCalledWith({
        where: { id: "some-id" },
      });
    });
  });

  describe("activateDeliveryPerson / deactivateDeliveryPerson", () => {
    it("should return the nested address shape after activating", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne({
        isActive: true,
      });
      prismaMock.deliveryPerson.update.mockResolvedValue(deliveryPerson);

      const result = await service.activateDeliveryPerson(deliveryPerson.id);

      expect(result.address).toEqual({
        street: deliveryPerson.addressStreet,
        number: deliveryPerson.addressNumber,
        neighborhood: deliveryPerson.addressNeighborhood,
        zipCode: deliveryPerson.addressZipCode,
      });
    });

    it("should keep the session alive when activating", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.update.mockResolvedValue(deliveryPerson);

      await service.activateDeliveryPerson(deliveryPerson.id);

      expect(
        prismaMock.deliveryPersonSession.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it("should cut the session off immediately when deactivating", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne({
        isActive: false,
      });
      prismaMock.deliveryPerson.update.mockResolvedValue(deliveryPerson);

      await service.deactivateDeliveryPerson(deliveryPerson.id);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(prismaMock.deliveryPersonSession.deleteMany).toHaveBeenCalledWith({
        where: { deliveryPersonId: deliveryPerson.id },
      });
    });

    it("should translate a not-found error into DELIVERY_PERSON_NOT_FOUND", async () => {
      prismaMock.deliveryPerson.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.deactivateDeliveryPerson("missing-id"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });
  });
});
