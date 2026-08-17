import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { DeliveryPersonsOrdersService } from "../orders.service";

const DELIVERY_PERSON_ID = "delivery-person-id";

const makeOrder = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "order-id",
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
          include: { items: true },
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
});
