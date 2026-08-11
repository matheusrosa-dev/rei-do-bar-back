import { EventEmitter2 } from "@nestjs/event-emitter";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  OrderStatus,
  PaymentType,
} from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { AdminOrdersService } from "../orders.service";

const eventEmitterMock = { emit: jest.fn() };

const baseOrder = {
  id: "order-uuid",
  orderNumber: 1,
  customerId: "customer-uuid",
  address: "Rua A, 100",
  status: OrderStatus.PREPARING,
  statusReason: null,
  deliveryFee: 500,
  couponId: null,
  couponCode: null,
  couponDiscount: 0,
  paymentType: PaymentType.CASH,
  deliveryPersonId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [],
};

describe("AdminOrdersService", () => {
  let service: AdminOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<AdminOrdersService>(AdminOrdersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("updateOrderStatus — SHIPPED delivery-person assignment", () => {
    it("should throw DELIVERY_PERSON_NOT_FOUND without updating the order when the delivery person does not exist", async () => {
      prismaMock.order.findUnique.mockResolvedValue(baseOrder);
      prismaMock.$queryRaw.mockResolvedValue([]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus(baseOrder.id, {
          status: OrderStatus.SHIPPED,
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it("should throw DELIVERY_PERSON_INACTIVE without updating the order when the delivery person is inactive", async () => {
      prismaMock.order.findUnique.mockResolvedValue(baseOrder);
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: false,
      });

      await expect(
        service.updateOrderStatus(baseOrder.id, {
          status: OrderStatus.SHIPPED,
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_INACTIVE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it("should translate a foreign key violation on the status update into DELIVERY_PERSON_NOT_FOUND", async () => {
      prismaMock.order.findUnique.mockResolvedValue(baseOrder);
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("fk violation", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateOrderStatus(baseOrder.id, {
          status: OrderStatus.SHIPPED,
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should lock the delivery person row before assigning it to the order", async () => {
      prismaMock.order.findUnique.mockResolvedValue(baseOrder);
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.updateOrderStatus(baseOrder.id, {
        status: OrderStatus.SHIPPED,
        deliveryPersonId: "dp-1",
      });

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryPersonId: "dp-1" }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalled();
    });
  });

  describe("updateOrderDeliveryPerson", () => {
    it("should throw ORDER_NOT_FOUND when the order does not exist", async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrderDeliveryPerson("missing-id", {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminOrders.ORDER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.PREPARING,
    ])("should throw ORDER_NOT_SHIPPED without updating the order when the order is %s", async (status) => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status,
      });

      await expect(
        service.updateOrderDeliveryPerson(baseOrder.id, {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminOrders.ORDER_NOT_SHIPPED,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])("should lock the delivery person row and update the order when the order is %s", async (status) => {
      const assignedOrder = {
        ...baseOrder,
        status,
        deliveryPersonId: "dp-old",
      };
      prismaMock.order.findUnique
        .mockResolvedValueOnce(assignedOrder)
        .mockResolvedValue({ ...assignedOrder, deliveryPersonId: "dp-1" });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateOrderDeliveryPerson(baseOrder.id, {
        deliveryPersonId: "dp-1",
      });

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseOrder.id, status },
          data: { deliveryPersonId: "dp-1" },
        }),
      );
      expect(result).toMatchObject({
        deliveryPersonId: "dp-1",
        productsTotal: 0,
        productsDiscount: 0,
        total: baseOrder.deliveryFee,
      });
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it("should throw DELIVERY_PERSON_NOT_FOUND without updating the order when the delivery person does not exist", async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.SHIPPED,
      });
      prismaMock.$queryRaw.mockResolvedValue([]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrderDeliveryPerson(baseOrder.id, {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it("should throw DELIVERY_PERSON_INACTIVE without updating the order when the delivery person is inactive", async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.SHIPPED,
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: false,
      });

      await expect(
        service.updateOrderDeliveryPerson(baseOrder.id, {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_INACTIVE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    });

    it("should translate a foreign key violation on the update into DELIVERY_PERSON_NOT_FOUND", async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.SHIPPED,
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("fk violation", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateOrderDeliveryPerson(baseOrder.id, {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminDeliveryPersons
          .DELIVERY_PERSON_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should throw ORDER_INVALID_STATUS_TRANSITION when the guarded update affects no rows", async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.SHIPPED,
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateOrderDeliveryPerson(baseOrder.id, {
          deliveryPersonId: "dp-1",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminOrders
          .ORDER_INVALID_STATUS_TRANSITION,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });
});
