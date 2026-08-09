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
});
