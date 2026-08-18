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
  deliveredAt: null,
  cancelledAt: null,
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

  describe("listOrdersManagement — finalized window", () => {
    it("should window each finalized status by its own event timestamp, not by updatedAt", async () => {
      const now = new Date("2026-08-18T14:00:00.000Z");
      const tenHoursAgo = new Date("2026-08-18T04:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.findMany.mockResolvedValue([]);

        await service.listOrdersManagement();

        const [, [deliveredQuery], [cancelledQuery]] =
          prismaMock.order.findMany.mock.calls;

        // O updatedAt é bumpado por qualquer escrita posterior — a reatribuição
        // de entregador, que o admin faz em pedidos já finalizados, puxaria um
        // pedido antigo de volta para o board como se fosse recente.
        expect(deliveredQuery).toEqual(
          expect.objectContaining({
            where: {
              status: OrderStatus.DELIVERED,
              deliveredAt: { gte: tenHoursAgo },
            },
            orderBy: { deliveredAt: "desc" },
            take: 30,
          }),
        );
        expect(cancelledQuery).toEqual(
          expect.objectContaining({
            where: {
              status: OrderStatus.CANCELLED,
              cancelledAt: { gte: tenHoursAgo },
            },
            orderBy: { cancelledAt: "desc" },
            take: 30,
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("should build each finalized bucket from its own query, so a busy delivered column cannot empty the cancelled one", async () => {
      const delivered = Array.from({ length: 30 }, (_, index) => ({
        ...baseOrder,
        id: `delivered-${index}`,
        status: OrderStatus.DELIVERED,
      }));

      prismaMock.order.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(delivered)
        .mockResolvedValueOnce([
          { ...baseOrder, id: "cancelled-1", status: OrderStatus.CANCELLED },
        ]);

      const result = await service.listOrdersManagement();

      expect(result[OrderStatus.DELIVERED]).toHaveLength(30);
      expect(result[OrderStatus.CANCELLED]).toHaveLength(1);
    });
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

  describe("updateOrderStatus \u2014 DELIVERED timestamp", () => {
    const shippedOrder = {
      ...baseOrder,
      status: OrderStatus.SHIPPED,
      deliveryPersonId: "dp-1",
    };

    it("should stamp deliveredAt when the admin closes the delivery", async () => {
      const now = new Date("2026-08-18T14:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.findUnique.mockResolvedValue(shippedOrder);
        prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.order.findMany.mockResolvedValue([]);

        await service.updateOrderStatus(shippedOrder.id, {
          status: OrderStatus.DELIVERED,
        });

        // O board do admin e a contagem do entregador leem a hora da entrega
        // desta coluna; o updatedAt não serve, qualquer escrita posterior o
        // sobrescreve.
        expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: OrderStatus.DELIVERED,
              deliveredAt: now,
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it.each([
      [OrderStatus.SHIPPED, { deliveryPersonId: "dp-1" }],
      [OrderStatus.CANCELLED, { statusReason: "sem estoque" }],
    ])("should not stamp deliveredAt on the %s transition", async (status, extra) => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.PREPARING,
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.updateOrderStatus(baseOrder.id, { status, ...extra });

      const [{ data }] = prismaMock.order.updateMany.mock.calls[0];
      expect(data).not.toHaveProperty("deliveredAt");
    });
  });

  describe("updateOrderStatus — CANCELLED timestamp", () => {
    it("should stamp cancelledAt when the admin cancels the order", async () => {
      const now = new Date("2026-08-18T14:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.findUnique.mockResolvedValue({
          ...baseOrder,
          status: OrderStatus.PREPARING,
        });
        prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.order.findMany.mockResolvedValue([]);

        await service.updateOrderStatus(baseOrder.id, {
          status: OrderStatus.CANCELLED,
          statusReason: "sem estoque",
        });

        expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: OrderStatus.CANCELLED,
              statusReason: "sem estoque",
              cancelledAt: now,
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it.each([
      [
        OrderStatus.SHIPPED,
        OrderStatus.PREPARING,
        { deliveryPersonId: "dp-1" },
      ],
      [OrderStatus.DELIVERED, OrderStatus.SHIPPED, {}],
    ])("should not stamp cancelledAt on the %s transition (from %s)", async (status, from, extra) => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: from,
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: "dp-1" }]);
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.updateOrderStatus(baseOrder.id, { status, ...extra });

      const [{ data }] = prismaMock.order.updateMany.mock.calls[0];
      expect(data).not.toHaveProperty("cancelledAt");
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
