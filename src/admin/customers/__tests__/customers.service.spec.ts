import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { AdminCustomersService } from "../customers.service";

describe("AdminCustomersService", () => {
  let service: AdminCustomersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCustomersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminCustomersService>(AdminCustomersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("removeCustomer", () => {
    it("should throw CUSTOMER_NOT_FOUND when the row lock finds nothing", async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(service.removeCustomer("missing-id")).rejects.toMatchObject({
        code: AppException.errorCodes.adminCustomers.CUSTOMER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.customer.delete).not.toHaveBeenCalled();
    });

    it("should throw CUSTOMER_HAS_ORDERS when orders are linked, without deleting", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(1);

      await expect(service.removeCustomer("some-id")).rejects.toMatchObject({
        code: AppException.errorCodes.adminCustomers.CUSTOMER_HAS_ORDERS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });

      expect(prismaMock.customer.delete).not.toHaveBeenCalled();
    });

    it("should translate a foreign key violation on delete into CUSTOMER_HAS_ORDERS", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.customer.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("fk violation", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(service.removeCustomer("some-id")).rejects.toMatchObject({
        code: AppException.errorCodes.adminCustomers.CUSTOMER_HAS_ORDERS,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });
    });

    it("should delete when the row exists with no linked orders", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "some-id" }]);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.customer.delete.mockResolvedValue({} as never);

      await service.removeCustomer("some-id");

      expect(prismaMock.customer.delete).toHaveBeenCalledWith({
        where: { id: "some-id" },
      });
    });
  });

  describe("findAllSimple", () => {
    it("should return a flat, unpaginated list excluding soft-deleted customers", async () => {
      prismaMock.customer.findMany.mockResolvedValue([]);

      const result = await service.findAllSimple();

      expect(result).toEqual([]);
      expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: "asc" },
      });
      expect(prismaMock.customer.count).not.toHaveBeenCalled();
    });
  });
});
