import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
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
  });

  describe("findAllSimple", () => {
    it("should return a flat, unpaginated list ordered by name", async () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();
      prismaMock.deliveryPerson.findMany.mockResolvedValue([deliveryPerson]);

      const result = await service.findAllSimple();

      expect(result).toHaveLength(1);
      expect(prismaMock.deliveryPerson.findMany).toHaveBeenCalledWith({
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
