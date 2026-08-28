import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AdminDashboardService } from "../dashboard.service";

const DELIVERY_PERSON_ID = "delivery-person-id";

const at = (isoTime: string) => new Date(`2026-08-27T${isoTime}.000Z`);

const delivered = (shippedAt: Date | null, deliveredAt: Date | null) => ({
  status: OrderStatus.DELIVERED,
  shippedAt,
  deliveredAt,
  cancelledAt: null,
});

const cancelled = (shippedAt: Date | null, cancelledAt: Date | null) => ({
  status: OrderStatus.CANCELLED,
  shippedAt,
  deliveredAt: null,
  cancelledAt,
});

const item = (
  price: number,
  quantity: number,
  compareAtPrice: number | null = null,
) => ({
  price,
  compareAtPrice,
  quantity,
});

const deliveredOrder = (
  items: ReturnType<typeof item>[],
  deliveryFee: number,
  couponDiscount: number,
) => ({ items, deliveryFee, couponDiscount });

const mockReads = (shippedOrders: unknown[] = []) => {
  prismaMock.order.groupBy.mockResolvedValue([]);
  prismaMock.deliveryPerson.findMany.mockResolvedValue([]);
  prismaMock.order.findMany.mockResolvedValue(shippedOrders);
};

describe("AdminDashboardService", () => {
  let service: AdminDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findDeliveryPersonsPerformance", () => {
    it("should average each status from the dispatch stamp to its own closing one", async () => {
      mockReads([
        delivered(at("10:00:00"), at("10:30:00")),
        delivered(at("11:00:00"), at("11:50:00")),
        cancelled(at("12:00:00"), at("12:10:00")),
      ]);

      const { totals } = await service.findDeliveryPersonsPerformance({});

      expect(totals.averageDeliveryMinutes).toBe(40);
      expect(totals.averageCancellationAfterShippingMinutes).toBe(10);
    });

    it("should round the average to whole minutes, in both directions", async () => {
      // 20min e 21min40s dão 20min50s de média, que trunca para 20 e arredonda
      // para 21; o par cancelado dá 20min20s e vai para o outro lado.
      mockReads([
        delivered(at("10:00:00"), at("10:20:00")),
        delivered(at("11:00:00"), at("11:21:40")),
        cancelled(at("12:00:00"), at("12:20:00")),
        cancelled(at("13:00:00"), at("13:20:40")),
      ]);

      const { totals } = await service.findDeliveryPersonsPerformance({});

      expect(totals.averageDeliveryMinutes).toBe(21);
      expect(totals.averageCancellationAfterShippingMinutes).toBe(20);
    });

    it("should return null, not zero, when a status has no sample", async () => {
      mockReads([delivered(at("10:00:00"), at("10:30:00"))]);

      const { totals } = await service.findDeliveryPersonsPerformance({});

      expect(totals.averageDeliveryMinutes).toBe(30);
      // Um zero leria como "cancelado no instante em que saiu para entrega".
      expect(totals.averageCancellationAfterShippingMinutes).toBeNull();
    });

    it("should return null for both averages when nothing closed in the period", async () => {
      mockReads();

      const { totals } = await service.findDeliveryPersonsPerformance({});

      expect(totals.averageDeliveryMinutes).toBeNull();
      expect(totals.averageCancellationAfterShippingMinutes).toBeNull();
    });

    it("should skip a row missing its closing stamp instead of averaging NaN", async () => {
      mockReads([
        delivered(at("10:00:00"), at("10:30:00")),
        delivered(at("11:00:00"), null),
      ]);

      const { totals } = await service.findDeliveryPersonsPerformance({});

      // Nenhum caminho de escrita produz essa linha hoje, e é justamente o ponto:
      // sem a guarda, uma linha assim transforma o campo inteiro em NaN.
      expect(totals.averageDeliveryMinutes).toBe(30);
    });

    it("should read the averages over the same universe as the counts, narrowed by the dispatch stamp", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findDeliveryPersonsPerformance({ startDate, endDate });

      const [[groupByArgs]] = prismaMock.order.groupBy.mock.calls;
      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      expect(findManyArgs.where).toEqual({
        ...groupByArgs.where,
        shippedAt: { not: null },
      });
      // Refazer o filtro na segunda leitura é como as duas metades saem de
      // sincronia, e uma cópia igual passaria no assert acima — só a identidade
      // prova que a segunda leitura compartilha o filtro da primeira.
      expect(findManyArgs.where.OR).toBe(groupByArgs.where.OR);
      expect(groupByArgs.where).toEqual({
        deliveryPersonId: { not: null },
        OR: [
          {
            status: OrderStatus.DELIVERED,
            deliveredAt: { gte: startDate, lte: endDate },
          },
          {
            status: OrderStatus.CANCELLED,
            cancelledAt: { gte: startDate, lte: endDate },
          },
        ],
      });
    });

    it("should keep counting an order cancelled before dispatch that no average can measure", async () => {
      prismaMock.order.groupBy.mockResolvedValue([
        {
          deliveryPersonId: DELIVERY_PERSON_ID,
          status: OrderStatus.CANCELLED,
          _count: 1,
        },
      ]);
      prismaMock.deliveryPerson.findMany.mockResolvedValue([
        { id: DELIVERY_PERSON_ID, name: "Entregador" },
      ]);
      // Cancelado antes de sair para entrega: o where das médias o exclui.
      prismaMock.order.findMany.mockResolvedValue([]);

      const { totals, deliveryPersons } =
        await service.findDeliveryPersonsPerformance({});

      expect(totals).toEqual({
        totalOrdersCount: 1,
        deliveredOrdersCount: 0,
        cancelledOrdersCount: 1,
        averageDeliveryMinutes: null,
        averageCancellationAfterShippingMinutes: null,
      });
      expect(deliveryPersons).toEqual([
        {
          name: "Entregador",
          deliveredOrdersCount: 0,
          cancelledOrdersCount: 1,
        },
      ]);
    });
  });

  describe("findRevenue", () => {
    it("should sum the full order total and the coupon discount apart from it", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        // 2x1000 com compareAtPrice 1200: o desconto de produto (400) sai do
        // total mas não entra em couponDiscount.
        deliveredOrder([item(1000, 2, 1200)], 500, 300),
        deliveredOrder([item(1500, 1), item(700, 3)], 500, 0),
      ]);

      const revenue = await service.findRevenue({});

      // (2400 - 400) + 500 - 300 = 2200 | (1500 + 2100) + 500 = 4100
      expect(revenue).toEqual({
        deliveredOrdersCount: 2,
        revenue: 6300,
        couponDiscount: 300,
      });
    });

    it("should return zeros, not nulls, when nothing was delivered in the period", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      // Aqui zero é resposta legítima — nada faturado. O null do endpoint irmão
      // existe porque média sem amostra não é zero.
      expect(await service.findRevenue({})).toEqual({
        deliveredOrdersCount: 0,
        revenue: 0,
        couponDiscount: 0,
      });
    });

    it("should read only delivered orders, narrowed by the delivery stamp when a range is given", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      prismaMock.order.findMany.mockResolvedValue([]);

      await service.findRevenue({ startDate, endDate });

      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      expect(findManyArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
      });
    });

    it("should drop the date filter entirely when no bound is given", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.findRevenue({});

      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      // O padrão é lifetime, e é a ausência do filtro que mantém dentro da
      // conta os entregues sem deliveredAt (a migração não fez backfill).
      expect(findManyArgs.where).not.toHaveProperty("deliveredAt");
    });
  });
});
