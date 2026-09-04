import { Test, TestingModule } from "@nestjs/testing";
import {
  InventoryMovementOrigin,
  OrderStatus,
} from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AdminDashboardService } from "../dashboard.service";

const DELIVERY_PERSON_ID = "delivery-person-id";
const OTHER_DELIVERY_PERSON_ID = "other-delivery-person-id";
const PRODUCT_ID = "product-id";
const OTHER_PRODUCT_ID = "other-product-id";

const at = (isoTime: string) => new Date(`2026-08-27T${isoTime}.000Z`);

const dispatched = (shippedAt: Date | null, deliveredAt: Date | null) => ({
  shippedAt,
  deliveredAt,
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

let customerSequence = 0;

const deliveredOrder = (
  deliveredAt: Date | null,
  items: ReturnType<typeof item>[],
  deliveryFee = 0,
  couponDiscount = 0,
  // Each order belongs to its own customer unless a test says otherwise, so the
  // first-delivery figure reads as "one per order" without extra setup.
  customerId = `customer-${++customerSequence}`,
  deliveryPersonIsVolunteer = false,
) => ({
  customerId,
  deliveredAt,
  items,
  deliveryFee,
  couponDiscount,
  deliveryPersonIsVolunteer,
});

const firstDeliveryOf = (order: ReturnType<typeof deliveredOrder>) => ({
  customerId: order.customerId,
  _min: { deliveredAt: order.deliveredAt },
});

const productGroup = (
  productId: string,
  soldQuantity: number | null,
  ordersCount: number,
) => ({
  productId,
  _count: ordersCount,
  _sum: { quantity: soldQuantity },
});

const couponGroup = (
  couponCode: string,
  ordersCount: number,
  discountTotal: number | null,
) => ({
  couponCode,
  _count: ordersCount,
  _sum: { couponDiscount: discountTotal },
});

const middayOf = (isoDate: string) => new Date(`${isoDate}T12:00:00-03:00`);
const startOf = (isoDate: string) => new Date(`${isoDate}T00:00:00-03:00`);
const endOf = (isoDate: string) => new Date(`${isoDate}T23:59:59-03:00`);

type Reads = {
  rosterGroups?: unknown[];
  firstDeliveryGroups?: unknown[];
  deliveredOrders?: unknown[];
  shippedOrders?: unknown[];
  deliveryPersons?: unknown[];
  deliveredOrdersCount?: number;
  failedDeliveriesCount?: number;
  newCustomersCount?: number;
  restockProducts?: unknown[];
  deliveryPersonBonusTotal?: number | null;
  volunteeredBonusTotal?: number | null;
  productGroups?: unknown[];
  couponGroups?: unknown[];
  products?: unknown[];
};

// The readings issue several reads over the same handful of Prisma methods, so
// the stubs answer by what each query asks for instead of by call order — which
// keeps a test that exercises two readings at once from depending on the order
// the two issue their queries in.
const mockReads = ({
  rosterGroups = [],
  firstDeliveryGroups = [],
  deliveredOrders = [],
  shippedOrders = [],
  deliveryPersons = [],
  deliveredOrdersCount = 0,
  failedDeliveriesCount = 0,
  newCustomersCount = 0,
  restockProducts = [],
  deliveryPersonBonusTotal = null,
  volunteeredBonusTotal = null,
  productGroups = [],
  couponGroups = [],
  products = [],
}: Reads = {}) => {
  // The summary's bonus sum is a groupBy on the volunteer flag alone; a group
  // is emitted only for a side that was asked for.
  const bonusGroups = [
    ...(deliveryPersonBonusTotal === null
      ? []
      : [
          {
            deliveryPersonIsVolunteer: false,
            _sum: { deliveryPersonBonus: deliveryPersonBonusTotal },
          },
        ]),
    ...(volunteeredBonusTotal === null
      ? []
      : [
          {
            deliveryPersonIsVolunteer: true,
            _sum: { deliveryPersonBonus: volunteeredBonusTotal },
          },
        ]),
  ];

  prismaMock.order.groupBy.mockImplementation(({ by }) => {
    if (by.includes("customerId")) {
      return Promise.resolve(firstDeliveryGroups);
    }

    if (by.includes("deliveryPersonId")) {
      return Promise.resolve(rosterGroups);
    }

    if (by.includes("couponCode")) {
      return Promise.resolve(couponGroups);
    }

    return Promise.resolve(bonusGroups);
  });

  prismaMock.orderItem.groupBy.mockResolvedValue(productGroups);
  prismaMock.product.findMany.mockResolvedValue(products);

  prismaMock.order.count.mockImplementation(({ where }) =>
    Promise.resolve(
      where.deliveryPersonId ? failedDeliveriesCount : deliveredOrdersCount,
    ),
  );

  prismaMock.order.findMany.mockImplementation(({ where }) =>
    Promise.resolve(where.shippedAt ? shippedOrders : deliveredOrders),
  );

  prismaMock.deliveryPerson.findMany.mockResolvedValue(deliveryPersons);
  prismaMock.customer.count.mockResolvedValue(newCustomersCount);
  prismaMock.inventoryMovementProduct.findMany.mockResolvedValue(
    restockProducts,
  );
};

const orderGroupByCalls = () =>
  prismaMock.order.groupBy.mock.calls.map(([args]) => args);

const orderFindManyCalls = () =>
  prismaMock.order.findMany.mock.calls.map(([args]) => args);

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
    it("should answer a roster and nothing else", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 4,
            _sum: { deliveryFee: 2000, deliveryPersonBonus: 800 },
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
            _sum: { deliveryFee: 500, deliveryPersonBonus: 200 },
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      // The durations and the summary's failed-deliveries counter live on the
      // summary reading: a totals half here would report the same numbers twice.
      // The fee total is delivered-only (the cancelled 500 is dropped); the
      // bonus spans both branches (800 + 200); payoutTotal adds the two.
      expect(await service.findDeliveryPersonsPerformance({})).toEqual({
        deliveryPersons: [
          {
            name: "Entregador",
            deliveredOrdersCount: 4,
            volunteeredDeliveriesCount: 0,
            cancelledOrdersCount: 1,
            deliveryFeeTotal: 2000,
            deliveryPersonBonusTotal: 1000,
            payoutTotal: 3000,
            volunteeredSavingsTotal: 0,
          },
        ],
      });
    });

    it("should not issue the dispatch-timing read or a separate bonus groupBy", async () => {
      mockReads();

      await service.findDeliveryPersonsPerformance({});

      // The roster is one groupBy (its own, keyed by delivery person) plus the
      // delivery-person lookup, and nothing else — the second order read went to
      // the reading that reports averages, and the bonus rides the roster's
      // groupBy pass, never the summary's flag-only bonus groupBy.
      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
      expect(prismaMock.order.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.order.groupBy.mock.calls[0][0].by).toContain(
        "deliveryPersonId",
      );
    });

    it("should split a volunteer's deliveries and route their fee and bonus into the savings total", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            deliveryPersonIsVolunteer: false,
            _count: 3,
            _sum: { deliveryFee: 1500, deliveryPersonBonus: 600 },
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            deliveryPersonIsVolunteer: true,
            _count: 2,
            _sum: { deliveryFee: 900, deliveryPersonBonus: 400 },
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            deliveryPersonIsVolunteer: true,
            _count: 1,
            _sum: { deliveryFee: 500, deliveryPersonBonus: 200 },
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      const { deliveryPersons } = await service.findDeliveryPersonsPerformance(
        {},
      );

      // Paid fields see the non-volunteer group only. The savings total is the
      // volunteer bonus over both terminal statuses (400 + 200) plus the
      // volunteer fee over the delivered group alone (900). The volunteer
      // cancelled order still counts in cancelledOrdersCount.
      expect(deliveryPersons).toEqual([
        {
          name: "Entregador",
          deliveredOrdersCount: 3,
          volunteeredDeliveriesCount: 2,
          cancelledOrdersCount: 1,
          deliveryFeeTotal: 1500,
          deliveryPersonBonusTotal: 600,
          payoutTotal: 2100,
          volunteeredSavingsTotal: 1500,
        },
      ]);
    });

    it("should count a cancelled order's bonus but not its fee", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
            _sum: { deliveryFee: 700, deliveryPersonBonus: 250 },
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      const { deliveryPersons } = await service.findDeliveryPersonsPerformance(
        {},
      );

      // No delivered group, so the fee slice is zero even though the cancelled
      // group carries one; the bonus is already handed over, so it counts.
      expect(deliveryPersons).toEqual([
        {
          name: "Entregador",
          deliveredOrdersCount: 0,
          volunteeredDeliveriesCount: 0,
          cancelledOrdersCount: 1,
          deliveryFeeTotal: 0,
          deliveryPersonBonusTotal: 250,
          payoutTotal: 250,
          volunteeredSavingsTotal: 0,
        },
      ]);
    });

    it("should sum the fee over the delivered branch only and the bonus over both", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 3,
            _sum: { deliveryFee: 1500, deliveryPersonBonus: 600 },
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 2,
            _sum: { deliveryFee: 900, deliveryPersonBonus: 400 },
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      const { deliveryPersons } = await service.findDeliveryPersonsPerformance(
        {},
      );

      // Fee: delivered branch alone (900 cancelled dropped). Bonus: both
      // branches (600 + 400). Payout: the two added.
      expect(deliveryPersons[0].deliveryFeeTotal).toBe(1500);
      expect(deliveryPersons[0].deliveryPersonBonusTotal).toBe(1000);
      expect(deliveryPersons[0].payoutTotal).toBe(2500);
    });

    it("should answer a zero fee and bonus total for a person whose groups carry no sum", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 1,
            _sum: { deliveryFee: null, deliveryPersonBonus: null },
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      const { deliveryPersons } = await service.findDeliveryPersonsPerformance(
        {},
      );

      expect(deliveryPersons[0].deliveryFeeTotal).toBe(0);
      expect(deliveryPersons[0].deliveryPersonBonusTotal).toBe(0);
      expect(deliveryPersons[0].payoutTotal).toBe(0);
    });

    it("should count only the orders that reached a delivery person, closed in the range", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findDeliveryPersonsPerformance({ startDate, endDate });

      const [[groupByArgs]] = prismaMock.order.groupBy.mock.calls;

      expect(groupByArgs.by).toEqual([
        "deliveryPersonId",
        "status",
        "deliveryPersonIsVolunteer",
      ]);
      // One pass carries the per-status count and both money sums together.
      expect(groupByArgs._sum).toEqual({
        deliveryFee: true,
        deliveryPersonBonus: true,
      });
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

    it("should look the roster up by the ids the groups produced, never by activation", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 2,
            _sum: { deliveryFee: 1000 },
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
            _sum: { deliveryFee: 500 },
          },
          {
            deliveryPersonId: OTHER_DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 3,
            _sum: { deliveryFee: 1500 },
          },
        ],
        deliveryPersons: [],
      });

      await service.findDeliveryPersonsPerformance({});

      const [[findManyArgs]] = prismaMock.deliveryPerson.findMany.mock.calls;

      // Two groups of the same person resolve to one id, and a deactivated
      // entregador with history in the window still belongs in the panel — no
      // isActive filter narrows this read.
      expect(findManyArgs.where).toEqual({
        id: { in: [DELIVERY_PERSON_ID, OTHER_DELIVERY_PERSON_ID] },
      });
      expect(findManyArgs.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
    });

    it("should answer an empty roster when nothing closed in the period", async () => {
      mockReads();

      expect(await service.findDeliveryPersonsPerformance({})).toEqual({
        deliveryPersons: [],
      });
    });
  });

  describe("findRankings", () => {
    it("should answer two empty lists when nothing sold or redeemed in the period", async () => {
      mockReads();

      expect(await service.findRankings({})).toEqual({
        products: [],
        coupons: [],
      });
    });

    it("should map each product group to its current name and image, keyed by id", async () => {
      mockReads({
        productGroups: [productGroup(PRODUCT_ID, 128, 74)],
        products: [
          {
            id: PRODUCT_ID,
            name: "Cerveja Long Neck",
            imageUrl: "https://cdn.example.com/long-neck.png",
          },
        ],
      });

      expect(await service.findRankings({})).toEqual({
        products: [
          {
            name: "Cerveja Long Neck",
            imageUrl: "https://cdn.example.com/long-neck.png",
            soldQuantity: 128,
            ordersCount: 74,
          },
        ],
        coupons: [],
      });
    });

    it("should map each coupon group to its code, order count and discount total", async () => {
      mockReads({
        couponGroups: [couponGroup("BEMVINDO", 31, 45_900)],
      });

      expect(await service.findRankings({})).toEqual({
        products: [],
        coupons: [{ code: "BEMVINDO", ordersCount: 31, discountTotal: 45_900 }],
      });
    });

    it("should default a null sum to zero on both lists", async () => {
      mockReads({
        productGroups: [productGroup(PRODUCT_ID, null, 3)],
        products: [{ id: PRODUCT_ID, name: "Produto", imageUrl: "img" }],
        couponGroups: [couponGroup("CODE10", 2, null)],
      });

      expect(await service.findRankings({})).toEqual({
        products: [
          { name: "Produto", imageUrl: "img", soldQuantity: 0, ordersCount: 3 },
        ],
        coupons: [{ code: "CODE10", ordersCount: 2, discountTotal: 0 }],
      });
    });

    it("should narrow both lists to delivered orders carrying a stamp, in the given range", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findRankings({ startDate, endDate });

      const [[productArgs]] = prismaMock.orderItem.groupBy.mock.calls;
      const couponArgs = prismaMock.order.groupBy.mock.calls
        .map(([args]) => args)
        .find((args) => args.by.includes("couponCode"));

      expect(productArgs.where).toEqual({
        order: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: startDate, lte: endDate },
        },
      });
      expect(couponArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
        couponCode: { not: null },
      });
    });

    it("should substitute a not-null delivery stamp for an absent range", async () => {
      mockReads();

      await service.findRankings({});

      const [[productArgs]] = prismaMock.orderItem.groupBy.mock.calls;
      const couponArgs = prismaMock.order.groupBy.mock.calls
        .map(([args]) => args)
        .find((args) => args.by.includes("couponCode"));

      expect(productArgs.where.order.deliveredAt).toEqual({ not: null });
      expect(couponArgs.where.deliveredAt).toEqual({ not: null });
    });

    it("should order products by quantity sold, tie-broken by id, capped at five", async () => {
      mockReads();

      await service.findRankings({});

      const [[productArgs]] = prismaMock.orderItem.groupBy.mock.calls;

      expect(productArgs.orderBy).toEqual([
        { _sum: { quantity: "desc" } },
        { productId: "asc" },
      ]);
      expect(productArgs.take).toBe(5);
    });

    it("should order coupons by redemption count, tie-broken by code, capped at five", async () => {
      mockReads();

      await service.findRankings({});

      const couponArgs = prismaMock.order.groupBy.mock.calls
        .map(([args]) => args)
        .find((args) => args.by.includes("couponCode"));

      expect(couponArgs.orderBy).toEqual([
        { _count: { couponCode: "desc" } },
        { couponCode: "asc" },
      ]);
      expect(couponArgs.take).toBe(5);
    });

    it("should look product names up by the ids the groups produced, never by active/deleted state", async () => {
      mockReads({
        productGroups: [
          productGroup(PRODUCT_ID, 10, 5),
          productGroup(OTHER_PRODUCT_ID, 4, 3),
        ],
        products: [
          { id: PRODUCT_ID, name: "Primeiro", imageUrl: "img-1" },
          { id: OTHER_PRODUCT_ID, name: "Segundo", imageUrl: "img-2" },
        ],
      });

      await service.findRankings({});

      const [[findManyArgs]] = prismaMock.product.findMany.mock.calls;

      expect(findManyArgs.where).toEqual({
        id: { in: [PRODUCT_ID, OTHER_PRODUCT_ID] },
      });
      expect(findManyArgs.select).toEqual({
        id: true,
        name: true,
        imageUrl: true,
      });
    });

    it("should keep the groupBy's order regardless of the order the names come back in", async () => {
      mockReads({
        productGroups: [
          productGroup(PRODUCT_ID, 10, 5),
          productGroup(OTHER_PRODUCT_ID, 4, 3),
        ],
        products: [
          { id: OTHER_PRODUCT_ID, name: "Segundo", imageUrl: "img-2" },
          { id: PRODUCT_ID, name: "Primeiro", imageUrl: "img-1" },
        ],
      });

      const { products } = await service.findRankings({});

      expect(products.map((product) => product.name)).toEqual([
        "Primeiro",
        "Segundo",
      ]);
    });
  });

  describe("findSeries", () => {
    it("should carry the money and the count on one point, over the same rows", async () => {
      mockReads({
        deliveredOrders: [
          // 2x1000 with compareAtPrice 1200: the product discount (400) comes off
          // the total but does not count as couponDiscount.
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 2, 1200)],
            500,
            300,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(1500, 1), item(700, 3)],
            500,
          ),
        ],
      });

      const { series } = await service.findSeries({});

      // (2400 - 400) + 500 - 300 = 2200 | (1500 + 2100) + 500 = 4100. With no
      // bound the granularity falls back to months, so both land on one point,
      // which carries every figure the two readings used to split between them.
      expect(series).toEqual([
        {
          label: "Agosto/2026",
          deliveredOrdersCount: 2,
          averageOrderValue: 3150,
          firstDeliveredOrdersCount: 2,
          redeemedCouponOrdersCount: 1,
          revenue: 6300,
          couponDiscount: 300,
          couponDiscountPercentage: 4.55,
        },
      ]);
    });

    it("should answer an empty series, not a zeroed point, when nothing was delivered in the period", async () => {
      mockReads();

      // Nothing delivered means no bucket, and the reading has no aggregate
      // half to answer a zero in: the empty series is the whole payload.
      expect(await service.findSeries({})).toEqual({ series: [] });
    });

    it("should read only delivered orders, narrowed by the delivery stamp when a range is given", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSeries({ startDate, endDate });

      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      expect(findManyArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
      });
    });

    it("should still require a delivery stamp when no bound is given", async () => {
      mockReads();

      await service.findSeries({});

      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      // The default is lifetime, but a delivered order with no stamp belongs to
      // no period: the same query drops it from every point, which is what keeps
      // the series over the same set as the summary reading with or without a
      // range.
      expect(findManyArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { not: null },
      });
    });

    it("should bucket by the São Paulo day, not the UTC one", async () => {
      // 01:30Z is 22:30 the previous day in Sao Paulo — the bar's peak hour.
      // Bucketing in UTC would push the delivery to the next day of the chart.
      const order = deliveredOrder(new Date("2026-08-27T01:30:00Z"), [
        item(1000, 1),
      ]);

      mockReads({
        deliveredOrders: [order],
        firstDeliveryGroups: [firstDeliveryOf(order)],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-27"),
      });

      expect(series).toEqual([
        {
          label: "26/08",
          deliveredOrdersCount: 1,
          averageOrderValue: 1000,
          firstDeliveredOrdersCount: 1,
          redeemedCouponOrdersCount: 0,
          revenue: 1000,
          couponDiscount: 0,
          couponDiscountPercentage: 0,
        },
      ]);
    });

    it("should bucket by the hour when the range covers a single day", async () => {
      const orders = [
        deliveredOrder(new Date("2026-08-26T14:30:00-03:00"), [item(1000, 1)]),
        deliveredOrder(new Date("2026-08-26T20:45:00-03:00"), [item(3000, 1)]),
      ];

      mockReads({
        deliveredOrders: orders,
        firstDeliveryGroups: orders.map(firstDeliveryOf),
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-26"),
      });

      // The bucket key has to carry the hour: with toISODate() both deliveries
      // fall into one key and the series becomes one point, labelled 00:00.
      expect(series).toHaveLength(2);
      expect(series[0]).toEqual({
        label: "14:00",
        deliveredOrdersCount: 1,
        averageOrderValue: 1000,
        firstDeliveredOrdersCount: 1,
        redeemedCouponOrdersCount: 0,
        revenue: 1000,
        couponDiscount: 0,
        couponDiscountPercentage: 0,
      });
      expect(series[1].label).toBe("20:00");
      expect(series[1].revenue).toBe(3000);
    });

    it("should still bucket by day at exactly 62 days of range", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-07-01"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-31"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-07-01"),
        endDate: endOf("2026-08-31"),
      });

      // With no granularity field in the payload, the label's format is what
      // makes the threshold observable.
      expect(series.map(({ label }) => label)).toEqual(["01/07", "31/08"]);
    });

    it("should switch to monthly buckets one day past the threshold", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-06-30"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-31"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-06-30"),
        endDate: endOf("2026-08-31"),
      });

      expect(series.map(({ label }) => label)).toEqual([
        "Junho/2026",
        "Agosto/2026",
      ]);
    });

    it("should collapse different days of the same month into one monthly point", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-03"), [item(1000, 1)], 0, 100),
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
        ],
      });

      const { series } = await service.findSeries({});

      expect(series).toEqual([
        {
          label: "Agosto/2026",
          deliveredOrdersCount: 2,
          averageOrderValue: 1450,
          firstDeliveredOrdersCount: 2,
          redeemedCouponOrdersCount: 1,
          revenue: 2900,
          couponDiscount: 100,
          couponDiscountPercentage: 3.33,
        },
      ]);
    });

    it("should divide each bucket's own revenue by its own count, rounding the average to the cent", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-26"), [item(1, 1)]),
          deliveredOrder(middayOf("2026-08-28"), [item(9000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      // 1001 over two orders is 500.5 — the average is money, so it lands on a
      // whole cent.
      expect(
        series.map(({ label, deliveredOrdersCount, averageOrderValue }) => [
          label,
          deliveredOrdersCount,
          averageOrderValue,
        ]),
      ).toEqual([
        ["26/08", 2, 501],
        ["28/08", 1, 9000],
      ]);
    });

    it("should leave out an empty bucket in the middle of a closed range", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-28"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      // A day with no delivery is absent from the series, not reported as a zero.
      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["26/08", 1000],
        ["28/08", 3000],
      ]);
    });

    it("should list sparse monthly buckets ascending regardless of the row order", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
          deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)]),
        ],
      });

      const { series } = await service.findSeries({});

      // With no bound there is no interval to fill: July does not appear, and
      // the position in the array is the only ordering contract left.
      expect(series.map(({ label }) => label)).toEqual([
        "Junho/2026",
        "Agosto/2026",
      ]);
    });

    it("should stay sparse and monthly when only one bound is given", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-01"),
      });

      // An open-ended interval has no end to fill up to.
      expect(series.map(({ label }) => label)).toEqual(["Agosto/2026"]);
    });

    it("should count a first delivery in the bucket that holds it, against the customer's whole history", async () => {
      const first = deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]);
      const returning = deliveredOrder(middayOf("2026-08-28"), [item(3000, 1)]);

      mockReads({
        deliveredOrders: [first, returning],
        firstDeliveryGroups: [
          firstDeliveryOf(first),
          // This customer had already been served before the window opened, so
          // their delivery inside it is not a first one.
          {
            customerId: returning.customerId,
            _min: { deliveredAt: middayOf("2026-05-10") },
          },
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      expect(
        series.map(({ label, firstDeliveredOrdersCount }) => [
          label,
          firstDeliveredOrdersCount,
        ]),
      ).toEqual([
        ["26/08", 1],
        ["28/08", 0],
      ]);
    });

    it("should skip the history query when no start bound is given", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({});

      // Without a start bound every delivery in range is the earliest one the
      // read can see, so the answer is free — the extra groupBy is not issued.
      expect(prismaMock.order.groupBy).not.toHaveBeenCalled();
      expect(series[0].firstDeliveredOrdersCount).toBe(2);
    });

    it("should sum its points into the summary reading's aggregates over a closed range", async () => {
      const orders = [
        deliveredOrder(middayOf("2026-08-26"), [item(1000, 2, 1200)], 500, 300),
        deliveredOrder(middayOf("2026-08-28"), [item(1500, 1)], 500),
      ];

      mockReads({
        deliveredOrdersCount: 2,
        deliveredOrders: orders,
        firstDeliveryGroups: orders.map(firstDeliveryOf),
      });

      const range = {
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      };
      const { series } = await service.findSeries(range);
      const {
        revenue,
        couponDiscount,
        deliveredOrdersCount,
        firstDeliveredOrdersCount,
        redeemedCouponOrdersCount,
      } = await service.findSummary(range);

      // Every summable figure lost its aggregate half here and kept it there,
      // so the invariant now spans two endpoints — which holds only because one
      // private issues the read for both.
      expect(series.reduce((sum, point) => sum + point.revenue, 0)).toBe(
        revenue,
      );
      expect(series.reduce((sum, point) => sum + point.couponDiscount, 0)).toBe(
        couponDiscount,
      );
      expect(
        series.reduce((sum, point) => sum + point.firstDeliveredOrdersCount, 0),
      ).toBe(firstDeliveredOrdersCount);
      expect(
        series.reduce((sum, point) => sum + point.redeemedCouponOrdersCount, 0),
      ).toBe(redeemedCouponOrdersCount);
      // The count is the one that reconciles only under a range: unranged, the
      // summary counter also takes in the rows carrying no delivery stamp.
      expect(
        series.reduce((sum, point) => sum + point.deliveredOrdersCount, 0),
      ).toBe(deliveredOrdersCount);
    });

    it("should count a redemption per bucket, so a coupon spanning two buckets counts once in each", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(2000, 1)], 0, 300),
          deliveredOrder(middayOf("2026-08-26"), [item(2000, 1)]),
          deliveredOrder(middayOf("2026-08-28"), [item(2000, 1)], 0, 300),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      expect(
        series.map(({ label, redeemedCouponOrdersCount }) => [
          label,
          redeemedCouponOrdersCount,
        ]),
      ).toEqual([
        ["26/08", 1],
        ["28/08", 1],
      ]);
    });

    it("should recompute each bucket's share over its own gross, never summing or averaging the points", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 0, 500),
          deliveredOrder(middayOf("2026-08-28"), [item(9000, 1)]),
        ],
      });

      const range = {
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      };
      const { series } = await service.findSeries(range);
      const { couponDiscountPercentage } = await service.findSummary(range);

      // 500/1000 and 0/9000 per bucket — and the period as a whole is 500/10000,
      // so the summary's figure is neither the sum of the points (50) nor their
      // average (25). The reading that reports it has no series to sum anyway.
      expect(
        series.map(({ label, couponDiscountPercentage: share }) => [
          label,
          share,
        ]),
      ).toEqual([
        ["26/08", 50],
        ["28/08", 0],
      ]);
      expect(couponDiscountPercentage).toBe(5);
    });

    it("should answer a real zero, not a null, for an order paid entirely by coupon", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 0, 1000),
        ],
      });

      const { series } = await service.findSeries({});

      // The coupon took the whole revenue: a real zero, not an empty sample.
      // The bucket exists only because a delivery landed in it, and its count
      // says so — which is what separates this zero from an empty period.
      expect(series).toEqual([
        {
          label: "Agosto/2026",
          deliveredOrdersCount: 1,
          averageOrderValue: 0,
          firstDeliveredOrdersCount: 1,
          redeemedCouponOrdersCount: 1,
          revenue: 0,
          couponDiscount: 1000,
          couponDiscountPercentage: 100,
        },
      ]);
    });

    it("should leave out an empty month between two months that had deliveries", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-06-01"),
        endDate: endOf("2026-08-31"),
      });

      // Skipping the empty bucket has to hold at monthly granularity too, not
      // only daily.
      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["Junho/2026", 1000],
        ["Agosto/2026", 3000],
      ]);
    });

    it("should return an empty series for an inverted range", async () => {
      // Rows still come back — the range narrows the query, and the query is
      // stubbed — so the inversion guard is the only thing emptying the series.
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-28"), [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({
        startDate: startOf("2026-08-28"),
        endDate: endOf("2026-08-26"),
      });

      expect(series).toEqual([]);
    });

    it("should return an empty series when the inversion stays inside one bucket", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(new Date("2026-08-10T09:00:00-03:00"), [
            item(1000, 1),
          ]),
        ],
      });

      // Both bounds land on the same day, so the granularity rule alone would
      // happily bucket the row: the guard has to read the bounds, not the unit.
      const { series } = await service.findSeries({
        startDate: new Date("2026-08-10T10:00:00-03:00"),
        endDate: new Date("2026-08-10T08:00:00-03:00"),
      });

      expect(series).toEqual([]);
    });

    it("should place an order delivered exactly on a bound in the bucket of that bound", async () => {
      const startDate = startOf("2026-08-26");
      const endDate = endOf("2026-08-27");

      mockReads({
        deliveredOrders: [
          deliveredOrder(startDate, [item(1000, 1)]),
          deliveredOrder(endDate, [item(3000, 1)]),
        ],
      });

      const { series } = await service.findSeries({ startDate, endDate });

      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["26/08", 1000],
        ["27/08", 3000],
      ]);
    });

    it("should not carry the summary's payout aggregates on a point", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)], 700),
        ],
      });

      const { series } = await service.findSeries({});

      // deliveryFeeTotal and deliveryPersonBonusTotal are summary-only breakouts
      // — the order series has no counterpart to sum them from, and payoutTotal
      // is a performance-roster figure that never reaches the series.
      expect(series[0]).not.toHaveProperty("deliveryFeeTotal");
      expect(series[0]).not.toHaveProperty("deliveryPersonBonusTotal");
      expect(series[0]).not.toHaveProperty("payoutTotal");
      expect(series[0]).not.toHaveProperty("volunteeredSavingsTotal");
    });

    it("should keep the money equality with no bound at all", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)], 0, 100),
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
        ],
      });

      const { series } = await service.findSeries({});
      const { revenue } = await service.findSummary({});

      // Since the query excludes the null stamp, no order counts in the total
      // without belonging to a bucket: the equality holds even with no range.
      expect(series).toHaveLength(2);
      expect(revenue).toBe(
        series.reduce((sum, point) => sum + point.revenue, 0),
      );
    });
  });

  describe("findSummary", () => {
    it("should report the delivered and failed-deliveries counts off their own filtered reads", async () => {
      mockReads({ deliveredOrdersCount: 12, failedDeliveriesCount: 2 });

      const summary = await service.findSummary({});

      expect(summary.deliveredOrdersCount).toBe(12);
      // The summary's only cancelled-order figure — the assigned-and-cancelled
      // slice the performance roster counts over, not the period's cancellations.
      expect(summary.failedDeliveriesCount).toBe(2);
      // The period-wide cancelled counter was dropped, not renamed.
      expect(summary).not.toHaveProperty("cancelledOrdersCount");
      expect(summary).not.toHaveProperty("assignedCancelledOrdersCount");
    });

    it("should answer zeros when nothing closed in the period", async () => {
      mockReads();

      expect(await service.findSummary({})).toEqual({
        deliveredOrdersCount: 0,
        failedDeliveriesCount: 0,
        averageOrderValue: 0,
        highestOrderValue: 0,
        redeemedCouponOrdersCount: 0,
        firstDeliveredOrdersCount: 0,
        newCustomersCount: 0,
        averageDeliveryMinutes: 0,
        revenue: 0,
        deliveryFeeTotal: 0,
        deliveryPersonBonusTotal: 0,
        volunteeredSavingsTotal: 0,
        restockCost: 0,
        profit: 0,
        profitPercentage: 0,
        couponDiscount: 0,
        couponDiscountPercentage: 0,
      });
    });

    it("should average the dispatch-to-delivery span in whole minutes", async () => {
      mockReads({
        shippedOrders: [
          dispatched(at("10:00:00"), at("10:30:00")),
          dispatched(at("11:00:00"), at("11:50:00")),
        ],
      });

      const { averageDeliveryMinutes } = await service.findSummary({});

      expect(averageDeliveryMinutes).toBe(40);
    });

    it("should round the delivery average to whole minutes", async () => {
      // 20min and 21min40s average to 20min50s, which rounds up to 21.
      mockReads({
        shippedOrders: [
          dispatched(at("10:00:00"), at("10:20:00")),
          dispatched(at("11:00:00"), at("11:21:40")),
        ],
      });

      const { averageDeliveryMinutes } = await service.findSummary({});

      expect(averageDeliveryMinutes).toBe(21);
    });

    it("should answer zero for the delivery average when nothing was dispatched", async () => {
      mockReads({ shippedOrders: [] });

      const { averageDeliveryMinutes } = await service.findSummary({});

      // The payload carries no null — and its sample is narrower than every
      // counter here, so nothing on the summary tells an empty sample apart
      // from a real instant close.
      expect(averageDeliveryMinutes).toBe(0);
    });

    it("should answer the same zero for a delivery that took no measurable time", async () => {
      mockReads({
        deliveredOrdersCount: 1,
        shippedOrders: [dispatched(at("12:00:00"), at("12:00:00"))],
      });

      const { averageDeliveryMinutes, deliveredOrdersCount } =
        await service.findSummary({});

      // A real measurement of zero, indistinguishable on the summary from an
      // empty sample.
      expect(averageDeliveryMinutes).toBe(0);
      expect(deliveredOrdersCount).toBe(1);
    });

    it("should skip a dispatched row missing its delivery stamp instead of averaging NaN", async () => {
      mockReads({
        shippedOrders: [
          dispatched(at("10:00:00"), at("10:30:00")),
          dispatched(at("11:00:00"), null),
        ],
      });

      const { averageDeliveryMinutes } = await service.findSummary({});

      // Unranged, this is a backfilled row: without the guard it turns the
      // whole field into NaN.
      expect(averageDeliveryMinutes).toBe(30);
    });

    it("should read the dispatch timing over assigned, delivered, dispatched orders in range", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });

      const [shippedArgs] = orderFindManyCalls().filter(
        ({ where }) => where.shippedAt,
      );

      // A narrower slice of the delivered universe — assigned and dispatched —
      // pairing the range with the delivery stamp, not the closed-status OR.
      expect(shippedArgs.where).toEqual({
        deliveryPersonId: { not: null },
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
        shippedAt: { not: null },
      });
      expect(shippedArgs.select).toEqual({
        shippedAt: true,
        deliveredAt: true,
      });
    });

    it("should report the revenue the series next door adds up to", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 2, 1200)],
            500,
            300,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(1500, 1), item(700, 3)],
            500,
          ),
        ],
      });

      const { revenue } = await service.findSummary({});

      // Delivery fee included, net of coupon, product discount absorbed — the
      // same total the series reading plots, now aggregated only here.
      expect(revenue).toBe(6300);
    });

    it("should sum the coupon discount and divide it by the gross, not by the revenue", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 2, 1200)],
            500,
            300,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(1500, 1), item(700, 3)],
            500,
          ),
        ],
      });

      const { couponDiscount, couponDiscountPercentage } =
        await service.findSummary({});

      // The series reading plots 6300 over these same rows, already net of
      // the coupon: the share is 300 / (6300 + 300), never 300 / 6300.
      expect(couponDiscount).toBe(300);
      expect(couponDiscountPercentage).toBe(4.55);
    });

    it("should answer a hundred percent for an order paid entirely by coupon", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 0, 1000),
        ],
      });

      // The coupon took the whole revenue, but the gross still exists — it is
      // what the coupon was taken from — so this is a measurement, not an empty
      // sample. The counters beside it are what say the period had an order.
      const { couponDiscount, couponDiscountPercentage } =
        await service.findSummary({});

      expect(couponDiscount).toBe(1000);
      expect(couponDiscountPercentage).toBe(100);
    });

    it("should count one redemption per order, however many orders share the coupon", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(2000, 1)], 0, 300),
          // The same coupon on a second order: two redemptions, not one. The read
          // carries no coupon id, and the figure does not need one — it counts
          // orders that redeemed, never distinct coupons.
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)], 0, 300),
          deliveredOrder(middayOf("2026-08-28"), [item(2000, 1)], 0, 900),
          deliveredOrder(middayOf("2026-08-29"), [item(2000, 1)]),
        ],
      });

      const { redeemedCouponOrdersCount } = await service.findSummary({});

      expect(redeemedCouponOrdersCount).toBe(3);
    });

    it("should report the priciest delivered order of the period, on the same total the average uses", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 500),
          // 2x2000 off a compareAtPrice of 2500, plus a 400 fee, less a 900
          // coupon: 3500, the priciest of the three.
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(2000, 2, 2500)],
            400,
            900,
          ),
          deliveredOrder(middayOf("2026-08-28"), [item(3000, 1)], 0),
        ],
      });

      const { highestOrderValue } = await service.findSummary({});

      expect(highestOrderValue).toBe(3500);
    });

    it("should answer zero, not null, for the priciest order of an empty period", async () => {
      mockReads();

      // The module answers no null anywhere, so an empty period and a delivery
      // that invoiced nothing read alike; the counters beside it separate them.
      const { highestOrderValue } = await service.findSummary({});

      expect(highestOrderValue).toBe(0);
    });

    it("should divide what the period invoiced by the orders that invoiced it", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 2, 1200)],
            500,
            300,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(1500, 1), item(700, 3)],
            500,
          ),
        ],
      });

      // The same 6300 over the same two orders the series reading plots: this
      // is its ticket médio, moved here.
      const { averageOrderValue } = await service.findSummary({});

      expect(averageOrderValue).toBe(3150);
    });

    it("should read the average over the delivered orders carrying a stamp, not over its own counter", async () => {
      // The counter comes from a plain count and takes the stamp-less rows in;
      // the average comes from the delivered-orders read, which does not. With
      // no range the two divisors legitimately differ, so averageOrderValue
      // times deliveredOrdersCount is not the period revenue.
      mockReads({
        deliveredOrdersCount: 3,
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]),
        ],
      });

      const { deliveredOrdersCount, averageOrderValue } =
        await service.findSummary({});

      expect(deliveredOrdersCount).toBe(3);
      // 4000 over the two stamped rows, never over the three counted ones.
      expect(averageOrderValue).toBe(2000);
    });

    it("should count a first delivery against the customer's whole history, not the window", async () => {
      const first = deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]);
      const returning = deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]);

      mockReads({
        deliveredOrders: [first, returning],
        firstDeliveryGroups: [
          firstDeliveryOf(first),
          {
            customerId: returning.customerId,
            _min: { deliveredAt: middayOf("2026-05-10") },
          },
        ],
      });

      const { firstDeliveredOrdersCount } = await service.findSummary({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-27"),
      });

      expect(firstDeliveredOrdersCount).toBe(1);
    });

    it("should ask the customer history only about the customers already in range", async () => {
      const order = deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]);

      mockReads({
        deliveredOrders: [order],
        firstDeliveryGroups: [firstDeliveryOf(order)],
      });

      await service.findSummary({ startDate: startOf("2026-08-26") });

      const [firstDeliveryArgs] = orderGroupByCalls().filter(({ by }) =>
        by.includes("customerId"),
      );

      // The history read is deliberately unbounded in time — narrowing it by the
      // range would make "first" mean "first in the window" — and bounded only
      // by the customers the delivered-orders read already named.
      expect(firstDeliveryArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { not: null },
        customerId: { in: [order.customerId] },
      });
    });

    it("should count every delivered customer as a first delivery when no start bound is given", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
          deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]),
        ],
      });

      const { firstDeliveredOrdersCount } = await service.findSummary({});

      expect(firstDeliveredOrdersCount).toBe(2);
      // A start-bound-less call skips the customer-history groupBy — the first
      // delivery is free. The bonus groupBy still goes out (it does not depend
      // on the range), so only the customerId one is absent.
      expect(
        orderGroupByCalls().filter(({ by }) => by.includes("customerId")),
      ).toHaveLength(0);
    });

    it("should count a customer once, however many deliveries they took in the period", async () => {
      const customerId = "customer-served-twice";

      mockReads({
        deliveredOrdersCount: 2,
        deliveredOrders: [
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 1)],
            0,
            0,
            customerId,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(3000, 1)],
            0,
            0,
            customerId,
          ),
        ],
      });

      const { deliveredOrdersCount, firstDeliveredOrdersCount } =
        await service.findSummary({});

      // The figure counts customers, not orders: the second delivery is the
      // same customer coming back, and only their earliest one is a first.
      expect(deliveredOrdersCount).toBe(2);
      expect(firstDeliveredOrdersCount).toBe(1);
    });

    it("should count the signups of the period, off the customer table", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads({ newCustomersCount: 7 });

      const { newCustomersCount } = await service.findSummary({
        startDate,
        endDate,
      });

      const [[countArgs]] = prismaMock.customer.count.mock.calls;

      expect(newCustomersCount).toBe(7);
      // Signups, not purchases — and no deletedAt filter, unlike the admin
      // customer listing.
      expect(countArgs.where).toEqual({
        createdAt: { gte: startDate, lte: endDate },
      });
    });

    it("should discount the restock cost and the delivery fee from what the period invoiced", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 2, 1200)],
            500,
            300,
          ),
          deliveredOrder(
            middayOf("2026-08-27"),
            [item(1500, 1), item(700, 3)],
            500,
          ),
        ],
        restockProducts: [
          { price: 1000, quantity: 2 },
          { price: 500, quantity: 1 },
        ],
      });

      const {
        revenue,
        deliveryFeeTotal,
        deliveryPersonBonusTotal,
        restockCost,
        profit,
        profitPercentage,
      } = await service.findSummary({});

      // Revenue embeds the two 500 fees; profit nets them back out — they are
      // handed to the entregador, not kept — along with the restock cost (the
      // movement lines' price times quantity). No bonus in this period. The
      // margin still divides by the revenue, never by the gross or a
      // fee-adjusted base.
      expect(revenue).toBe(6300);
      expect(deliveryFeeTotal).toBe(1000);
      expect(deliveryPersonBonusTotal).toBe(0);
      expect(restockCost).toBe(2500);
      expect(profit).toBe(2800);
      expect(profitPercentage).toBe(44.44);
    });

    it("should net the delivery-person bonus out of profit as a pure outflow", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 500),
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)], 500),
        ],
        restockProducts: [{ price: 500, quantity: 1 }],
        deliveryPersonBonusTotal: 600,
      });

      const { revenue, deliveryFeeTotal, deliveryPersonBonusTotal, profit } =
        await service.findSummary({});

      // The bonus never entered revenue (4000 = 1500 + 2500), so subtracting it
      // pushes profit below the gross margin: 4000 - 500 restock - 1000 fee -
      // 600 bonus.
      expect(revenue).toBe(4000);
      expect(deliveryFeeTotal).toBe(1000);
      expect(deliveryPersonBonusTotal).toBe(600);
      expect(profit).toBe(1900);
    });

    it("should sum the bonus over assigned closed orders, delivered and cancelled alike", async () => {
      mockReads({ deliveryPersonBonusTotal: 1200 });

      const { deliveryPersonBonusTotal } = await service.findSummary({
        startDate: at("00:00:00"),
        endDate: at("23:59:59"),
      });

      const [bonusGroupBy] = orderGroupByCalls().filter(
        ({ by }) => by.length === 1 && by[0] === "deliveryPersonIsVolunteer",
      );

      expect(deliveryPersonBonusTotal).toBe(1200);
      // Its own groupBy _sum, split on the volunteer flag — the delivered-orders
      // reducer is delivered-only — over the roster's assigned-and-closed
      // predicate.
      expect(bonusGroupBy._sum).toEqual({ deliveryPersonBonus: true });
      expect(bonusGroupBy.where).toEqual({
        deliveryPersonId: { not: null },
        OR: [
          {
            status: OrderStatus.DELIVERED,
            deliveredAt: { gte: at("00:00:00"), lte: at("23:59:59") },
          },
          {
            status: OrderStatus.CANCELLED,
            cancelledAt: { gte: at("00:00:00"), lte: at("23:59:59") },
          },
        ],
      });
    });

    it("should split the bonus sum into the paid total and the volunteered savings", async () => {
      mockReads({
        deliveryPersonBonusTotal: 800,
        volunteeredBonusTotal: 300,
        deliveredOrders: [
          // A volunteer's delivered order: its fee is kept in revenue and feeds
          // the savings total, never deliveryFeeTotal.
          deliveredOrder(
            middayOf("2026-08-26"),
            [item(1000, 1)],
            500,
            0,
            undefined,
            true,
          ),
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)], 700),
        ],
      });

      const {
        revenue,
        deliveryFeeTotal,
        deliveryPersonBonusTotal,
        volunteeredSavingsTotal,
      } = await service.findSummary({});

      // revenue keeps both fees (1500 + 2700). deliveryFeeTotal drops the
      // volunteer's 500. volunteeredSavingsTotal is the volunteer bonus (300)
      // plus the volunteer delivered fee (500).
      expect(revenue).toBe(4200);
      expect(deliveryFeeTotal).toBe(700);
      expect(deliveryPersonBonusTotal).toBe(800);
      expect(volunteeredSavingsTotal).toBe(800);
    });

    it("should reconcile the summary bonus with the roster's per-person sum for the same range", async () => {
      const range = {
        startDate: at("00:00:00"),
        endDate: at("23:59:59"),
      };

      mockReads({
        deliveryPersonBonusTotal: 900,
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 2,
            _sum: { deliveryFee: 1000, deliveryPersonBonus: 500 },
          },
          {
            deliveryPersonId: OTHER_DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
            _sum: { deliveryFee: 400, deliveryPersonBonus: 400 },
          },
        ],
        deliveryPersons: [
          { id: DELIVERY_PERSON_ID, name: "A" },
          { id: OTHER_DELIVERY_PERSON_ID, name: "B" },
        ],
      });

      const { deliveryPersonBonusTotal } = await service.findSummary(range);
      const { deliveryPersons } =
        await service.findDeliveryPersonsPerformance(range);

      // Both reads run buildAssignedClosedFilter over the same predicate, so the
      // per-person bonuses add up to the summary's figure (the bonus groupBy
      // stub stands in for that same non-volunteer sum).
      expect(
        deliveryPersons.reduce(
          (sum, person) => sum + person.deliveryPersonBonusTotal,
          0,
        ),
      ).toBe(deliveryPersonBonusTotal);
    });

    it("should break the delivery-fee slice of the revenue out on its own", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 500),
          deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)], 700, 200),
        ],
      });

      const { revenue, deliveryFeeTotal } = await service.findSummary({});

      // The fee is already inside revenue ((1000 + 500) + (2000 + 700 - 200) =
      // 4000): deliveryFeeTotal just reports the 500 + 700 slice of it.
      expect(revenue).toBe(4000);
      expect(deliveryFeeTotal).toBe(1200);
    });

    it("should report a negative profit when restocking cost more than the period invoiced", async () => {
      mockReads({
        deliveredOrders: [
          deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
        ],
        restockProducts: [{ price: 1500, quantity: 1 }],
      });

      const { profit, profitPercentage } = await service.findSummary({});

      // The only two fields in the module that can go below zero — clamping them
      // would hide a month that bought more than it sold.
      expect(profit).toBe(-500);
      expect(profitPercentage).toBe(-50);
    });

    it("should answer zero percent for a period that invoiced nothing but restocked", async () => {
      mockReads({ restockProducts: [{ price: 1500, quantity: 1 }] });

      const { profit, profitPercentage } = await service.findSummary({});

      expect(profit).toBe(-1500);
      expect(profitPercentage).toBe(0);
    });

    it("should read the restock cost off the admin movements of the period", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });

      const [[findManyArgs]] =
        prismaMock.inventoryMovementProduct.findMany.mock.calls;

      // A sale movement is not a cost: only the admin restock counts, and it is
      // dated by the movement, not by any order stamp.
      expect(findManyArgs.where).toEqual({
        inventoryMovement: {
          origin: InventoryMovementOrigin.ADMIN_RESTOCK,
          createdAt: { gte: startDate, lte: endDate },
        },
      });
    });

    it("should read the same delivered rows the series reading reads", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });
      await service.findSeries({ startDate, endDate });

      const [summaryRead, seriesRead] = orderFindManyCalls().filter(
        ({ where }) => !where.shippedAt,
      );

      // One private issues both, so the aggregates here and the points next
      // door describe the same orders.
      expect(summaryRead).toEqual(seriesRead);
    });

    it("should count the delivered orders with a plain count, not narrowed to an assignment", async () => {
      mockReads();

      await service.findSummary({});

      const [deliveredArgs] = prismaMock.order.count.mock.calls
        .map(([args]) => args)
        .filter(({ where }) => !where.deliveryPersonId);

      // One differently-filtered count, not a bucket read out of a wider
      // grouping — and no assignment clause, so an order cancelled while still
      // PENDING is out of scope for the failed-deliveries figure alone.
      expect(deliveredArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: undefined,
      });
    });

    it("should pair the range with each counter's own closing stamp", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });

      const wheres = prismaMock.order.count.mock.calls.map(
        ([args]) => args.where,
      );
      const deliveredWhere = wheres.find((where) => !where.deliveryPersonId);
      const failedWhere = wheres.find((where) => where.deliveryPersonId);

      expect(deliveredWhere).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
      });
      expect(failedWhere).toEqual({
        deliveryPersonId: { not: null },
        status: OrderStatus.CANCELLED,
        cancelledAt: { gte: startDate, lte: endDate },
      });
    });
  });
});
