import { EventEmitter2 } from "@nestjs/event-emitter";
import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { OrderStatusUpdatedEvent } from "@shared/events/order";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { DeliveryPersonsOrdersService } from "../orders.service";

const DELIVERY_PERSON_ID = "delivery-person-id";
const ORDER_ID = "order-id";

const eventEmitterMock = { emit: jest.fn() };

const makeOrder = (overrides?: Partial<Record<string, unknown>>) => ({
  id: ORDER_ID,
  customerId: "customer-id",
  orderNumber: 1042,
  address: "Rua A, 10 - Centro",
  status: OrderStatus.SHIPPED,
  deliveryFee: 500,
  couponDiscount: 0,
  items: [{ price: 1500, compareAtPrice: null, quantity: 2 }],
  ...overrides,
});

describe("DeliveryPersonsOrdersService", () => {
  let service: DeliveryPersonsOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryPersonsOrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<DeliveryPersonsOrdersService>(
      DeliveryPersonsOrdersService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findShippedOrders", () => {
    it("should scope the query to the delivery person and to SHIPPED orders", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.findShippedOrders(DELIVERY_PERSON_ID);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.SHIPPED,
          },
          // Sem os itens, computeOrderTotals quebra em produção — o mock os
          // devolve de qualquer jeito, então só este assert protege o include.
          include: {
            items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          },
        }),
      );
    });

    it("should order the delivery queue oldest first", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.findShippedOrders(DELIVERY_PERSON_ID);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "asc" } }),
      );
    });

    it("should return an empty list instead of throwing when nothing is out for delivery", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await expect(
        service.findShippedOrders(DELIVERY_PERSON_ID),
      ).resolves.toEqual([]);
    });

    it("should spread the shared totals over each order", async () => {
      prismaMock.order.findMany.mockResolvedValue([makeOrder()]);

      const [order] = await service.findShippedOrders(DELIVERY_PERSON_ID);

      expect(order).toMatchObject({
        orderNumber: 1042,
        productsTotal: 3000,
        productsDiscount: 0,
        total: 3500, // 3000 + 500 de entrega
      });
    });

    it("should derive the totals from the item snapshots, charging the compare-at price of a discounted item", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        makeOrder({
          items: [{ price: 1200, compareAtPrice: 1500, quantity: 2 }],
          couponDiscount: 300,
        }),
      ]);

      const [order] = await service.findShippedOrders(DELIVERY_PERSON_ID);

      expect(order).toMatchObject({
        productsTotal: 3000, // 1500 * 2
        productsDiscount: 600, // (1500 - 1200) * 2
        total: 2600, // 2400 + 500 - 300
      });
    });

    it("should map every returned order", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        makeOrder({ id: "first" }),
        makeOrder({ id: "second" }),
      ]);

      const result = await service.findShippedOrders(DELIVERY_PERSON_ID);

      expect(result).toHaveLength(2);
      expect(result.every((order) => "total" in order)).toBe(true);
    });
  });

  describe("markOrderAsDelivered", () => {
    it("should throw when no order with that id is assigned to the delivery person", async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it("should scope the lookup by the delivery person, so another courier's order is a not-found", async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_FOUND,
      });

      // Sem o deliveryPersonId no where, o entregador conseguiria entregar o
      // pedido de outro — este assert é a única barreira contra isso.
      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: ORDER_ID, deliveryPersonId: DELIVERY_PERSON_ID },
      });
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.PREPARING,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])("should refuse to deliver an order that is %s", async (status) => {
      prismaMock.order.findFirst.mockResolvedValue(makeOrder({ status }));

      await expect(
        service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_SHIPPED,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it("should move a shipped order to delivered with the status guarded in the where", async () => {
      const now = new Date("2026-08-18T14:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.findFirst.mockResolvedValue(makeOrder());
        prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

        await service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID);

        expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
          where: {
            id: ORDER_ID,
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.SHIPPED,
          },
          // Sem o deliveredAt aqui a coluna nasce nula e a contagem por janela
          // nunca enxerga a entrega feita pelo app.
          data: { status: OrderStatus.DELIVERED, deliveredAt: now },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("should throw when the status changed between the read and the write", async () => {
      prismaMock.order.findFirst.mockResolvedValue(makeOrder());
      // O admin cancelou o pedido no meio do caminho: o update condicional não
      // encontra a linha e a corrida vira erro em vez de um sucesso silencioso.
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.deliveryPersonsOrders.ORDER_NOT_SHIPPED,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it("should emit the status-updated event so the customer gets the delivery push", async () => {
      prismaMock.order.findFirst.mockResolvedValue(makeOrder());
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

      await service.markOrderAsDelivered(DELIVERY_PERSON_ID, ORDER_ID);

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        OrderStatusUpdatedEvent.NAME,
        expect.objectContaining({
          data: {
            order: expect.objectContaining({
              id: ORDER_ID,
              customerId: "customer-id",
              orderNumber: 1042,
              status: OrderStatus.DELIVERED,
            }),
          },
        }),
      );
    });
  });

  describe("countRecentDeliveries", () => {
    it("should count only this delivery person's orders delivered inside the window", async () => {
      const now = new Date("2026-08-18T14:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.count.mockResolvedValue(7);

        await service.countRecentDeliveries(DELIVERY_PERSON_ID);

        expect(prismaMock.order.count).toHaveBeenCalledWith({
          where: {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            // 10 horas antes de now — a janela é fechada no deliveredAt, e não
            // no updatedAt, que qualquer escrita posterior do admin sobrescreve.
            deliveredAt: { gte: new Date("2026-08-18T04:00:00.000Z") },
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("should return the count wrapped in an object", async () => {
      prismaMock.order.count.mockResolvedValue(7);

      await expect(
        service.countRecentDeliveries(DELIVERY_PERSON_ID),
      ).resolves.toEqual({ deliveredCount: 7 });
    });

    it("should return zero as an object instead of a bare number", async () => {
      // Um número solto quebra o WrapperDataInterceptor: `"data" in body` lança
      // TypeError sobre primitivo, e o zero sairia sem o envelope.
      prismaMock.order.count.mockResolvedValue(0);

      await expect(
        service.countRecentDeliveries(DELIVERY_PERSON_ID),
      ).resolves.toEqual({ deliveredCount: 0 });
    });
  });
});
