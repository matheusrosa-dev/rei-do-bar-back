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

let customerSequence = 0;

const deliveredOrder = (
  deliveredAt: Date | null,
  items: ReturnType<typeof item>[],
  deliveryFee = 0,
  couponDiscount = 0,
  // Each order belongs to its own customer unless a test says otherwise, so the
  // first-delivery figure reads as "one per order" without extra setup.
  customerId = `customer-${++customerSequence}`,
) => ({ customerId, deliveredAt, items, deliveryFee, couponDiscount });

const firstDeliveryOf = (order: ReturnType<typeof deliveredOrder>) => ({
  customerId: order.customerId,
  _min: { deliveredAt: order.deliveredAt },
});

const middayOf = (isoDate: string) => new Date(`${isoDate}T12:00:00-03:00`);
const startOf = (isoDate: string) => new Date(`${isoDate}T00:00:00-03:00`);
const endOf = (isoDate: string) => new Date(`${isoDate}T23:59:59-03:00`);

type Reads = {
  statusGroups?: unknown[];
  assignedGroups?: unknown[];
  rosterGroups?: unknown[];
  firstDeliveryGroups?: unknown[];
  deliveredOrders?: unknown[];
  shippedOrders?: unknown[];
  deliveryPersons?: unknown[];
  newCustomersCount?: number;
  restockProducts?: unknown[];
};

// The readings issue several reads over the same two Prisma methods, so the
// stubs answer by what each query asks for instead of by call order — which
// keeps a test that exercises two readings at once from depending on the order
// the two issue their queries in.
const mockReads = ({
  statusGroups = [],
  assignedGroups = [],
  rosterGroups = [],
  firstDeliveryGroups = [],
  deliveredOrders = [],
  shippedOrders = [],
  deliveryPersons = [],
  newCustomersCount = 0,
  restockProducts = [],
}: Reads = {}) => {
  prismaMock.order.groupBy.mockImplementation(({ by, where }) => {
    if (by.includes("customerId")) {
      return Promise.resolve(firstDeliveryGroups);
    }

    if (by.includes("deliveryPersonId")) {
      return Promise.resolve(rosterGroups);
    }

    if (where.deliveryPersonId) {
      return Promise.resolve(assignedGroups);
    }

    return Promise.resolve(statusGroups);
  });

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
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      // The durations and the assigned cancellation counter live on the summary
      // reading: a totals half here would report the same numbers twice.
      expect(await service.findDeliveryPersonsPerformance({})).toEqual({
        deliveryPersons: [
          {
            name: "Entregador",
            deliveredOrdersCount: 4,
            cancelledOrdersCount: 1,
          },
        ],
      });
    });

    it("should not issue the dispatch-timing read the summary reading owns", async () => {
      mockReads();

      await service.findDeliveryPersonsPerformance({});

      // The roster is a groupBy plus the delivery-person lookup, and nothing
      // else — the second order read went to the reading that reports averages.
      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    });

    it("should answer zero for a status a person has no order in", async () => {
      mockReads({
        rosterGroups: [
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
          },
        ],
        deliveryPersons: [{ id: DELIVERY_PERSON_ID, name: "Entregador" }],
      });

      const { deliveryPersons } = await service.findDeliveryPersonsPerformance(
        {},
      );

      expect(deliveryPersons).toEqual([
        {
          name: "Entregador",
          deliveredOrdersCount: 0,
          cancelledOrdersCount: 1,
        },
      ]);
    });

    it("should count only the orders that reached a delivery person, closed in the range", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findDeliveryPersonsPerformance({ startDate, endDate });

      const [[groupByArgs]] = prismaMock.order.groupBy.mock.calls;

      expect(groupByArgs.by).toEqual(["deliveryPersonId", "status"]);
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
          },
          {
            deliveryPersonId: DELIVERY_PERSON_ID,
            status: OrderStatus.CANCELLED,
            _count: 1,
          },
          {
            deliveryPersonId: OTHER_DELIVERY_PERSON_ID,
            status: OrderStatus.DELIVERED,
            _count: 3,
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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
      // The count is the one that reconciles only under a range: unranged, the
      // summary counter also takes in the rows carrying no delivery stamp.
      expect(
        series.reduce((sum, point) => sum + point.deliveredOrdersCount, 0),
      ).toBe(deliveredOrdersCount);
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
    it("should sum the groups of each terminal status into its own counter", async () => {
      mockReads({
        statusGroups: [
          { status: OrderStatus.DELIVERED, _count: 12 },
          { status: OrderStatus.CANCELLED, _count: 3 },
        ],
        assignedGroups: [{ status: OrderStatus.CANCELLED, _count: 2 }],
      });

      const {
        deliveredOrdersCount,
        cancelledOrdersCount,
        assignedCancelledOrdersCount,
      } = await service.findSummary({});

      expect(deliveredOrdersCount).toBe(12);
      // The wide counter takes in an order cancelled before anyone was assigned;
      // the narrow one is the same universe the performance roster counts over.
      expect(cancelledOrdersCount).toBe(3);
      expect(assignedCancelledOrdersCount).toBe(2);
    });

    it("should answer zeros when nothing closed in the period", async () => {
      mockReads();

      expect(await service.findSummary({})).toEqual({
        deliveredOrdersCount: 0,
        cancelledOrdersCount: 0,
        assignedCancelledOrdersCount: 0,
        averageOrderValue: 0,
        highestOrderValue: 0,
        redeemedCouponOrdersCount: 0,
        firstDeliveredOrdersCount: 0,
        newCustomersCount: 0,
        averageDeliveryMinutes: 0,
        averageCancellationAfterShippingMinutes: 0,
        revenue: 0,
        restockCost: 0,
        profit: 0,
        profitPercentage: 0,
        couponDiscount: 0,
        couponDiscountPercentage: 0,
      });
    });

    it("should count the assigned cancellations over the performance reading's own universe", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });
      await service.findDeliveryPersonsPerformance({ startDate, endDate });

      const [assignedArgs] = orderGroupByCalls().filter(
        ({ by, where }) =>
          where.deliveryPersonId && !by.includes("deliveryPersonId"),
      );
      const [rosterArgs] = orderGroupByCalls().filter(({ by }) =>
        by.includes("deliveryPersonId"),
      );

      // Two separate queries sharing one filter builder — the counter here and
      // the per-person ones next door have to answer over the same rows.
      expect(assignedArgs.where).toEqual(rosterArgs.where);
      // Only the status axis: this reading has no per-person half to report.
      expect(assignedArgs.by).toEqual(["status"]);
    });

    it("should average each status from the dispatch stamp to its own closing one", async () => {
      mockReads({
        shippedOrders: [
          delivered(at("10:00:00"), at("10:30:00")),
          delivered(at("11:00:00"), at("11:50:00")),
          cancelled(at("12:00:00"), at("12:10:00")),
        ],
      });

      const {
        averageDeliveryMinutes,
        averageCancellationAfterShippingMinutes,
      } = await service.findSummary({});

      expect(averageDeliveryMinutes).toBe(40);
      expect(averageCancellationAfterShippingMinutes).toBe(10);
    });

    it("should round the average to whole minutes, in both directions", async () => {
      // 20min and 21min40s average to 20min50s, which truncates to 20 and rounds
      // to 21; the cancelled pair averages 20min20s and goes the other way.
      mockReads({
        shippedOrders: [
          delivered(at("10:00:00"), at("10:20:00")),
          delivered(at("11:00:00"), at("11:21:40")),
          cancelled(at("12:00:00"), at("12:20:00")),
          cancelled(at("13:00:00"), at("13:20:40")),
        ],
      });

      const {
        averageDeliveryMinutes,
        averageCancellationAfterShippingMinutes,
      } = await service.findSummary({});

      expect(averageDeliveryMinutes).toBe(21);
      expect(averageCancellationAfterShippingMinutes).toBe(20);
    });

    it("should answer zero when a status has no sample", async () => {
      mockReads({
        shippedOrders: [delivered(at("10:00:00"), at("10:30:00"))],
      });

      const {
        averageDeliveryMinutes,
        averageCancellationAfterShippingMinutes,
        assignedCancelledOrdersCount,
      } = await service.findSummary({});

      expect(averageDeliveryMinutes).toBe(30);
      // Nothing was cancelled, and the payload carries no null: the zeroed
      // counter beside the average is what says the sample was empty.
      expect(averageCancellationAfterShippingMinutes).toBe(0);
      expect(assignedCancelledOrdersCount).toBe(0);
    });

    it("should answer the same zero for a close that took no time at all", async () => {
      mockReads({
        assignedGroups: [{ status: OrderStatus.CANCELLED, _count: 1 }],
        shippedOrders: [cancelled(at("12:00:00"), at("12:00:00"))],
      });

      const {
        averageCancellationAfterShippingMinutes,
        assignedCancelledOrdersCount,
      } = await service.findSummary({});

      // A real measurement of zero, not an empty sample — only the counter
      // beside it separates this case from the one above.
      expect(averageCancellationAfterShippingMinutes).toBe(0);
      expect(assignedCancelledOrdersCount).toBe(1);
    });

    it("should skip a row missing its closing stamp instead of averaging NaN", async () => {
      mockReads({
        shippedOrders: [
          delivered(at("10:00:00"), at("10:30:00")),
          delivered(at("11:00:00"), null),
        ],
      });

      const { averageDeliveryMinutes } = await service.findSummary({});

      // No write path produces this row today, and that is exactly the point:
      // without the guard, a row like this turns the whole field into NaN.
      expect(averageDeliveryMinutes).toBe(30);
    });

    it("should keep counting an order cancelled before dispatch that no average can measure", async () => {
      mockReads({
        assignedGroups: [{ status: OrderStatus.CANCELLED, _count: 1 }],
        // Cancelled before it ever left: the averages' where excludes it.
        shippedOrders: [],
      });

      const {
        assignedCancelledOrdersCount,
        averageCancellationAfterShippingMinutes,
      } = await service.findSummary({});

      expect(assignedCancelledOrdersCount).toBe(1);
      expect(averageCancellationAfterShippingMinutes).toBe(0);
    });

    it("should read the durations over the same universe as the assigned counter, narrowed by the dispatch stamp", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });

      const [assignedArgs] = orderGroupByCalls().filter(
        ({ where }) => where.deliveryPersonId,
      );
      const [shippedArgs] = orderFindManyCalls().filter(
        ({ where }) => where.shippedAt,
      );

      expect(shippedArgs.where).toEqual({
        ...assignedArgs.where,
        shippedAt: { not: null },
      });
      // Rebuilding the filter on the second read is how the two halves fall out
      // of sync, and an equal copy would still pass the assert above — only
      // identity proves the second read shares the first one's filter.
      expect(shippedArgs.where.OR).toBe(assignedArgs.where.OR);
      expect(assignedArgs.where).toEqual({
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

    it("should report the revenue the series next door adds up to", async () => {
      mockReads({
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 1 }],
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 4 }],
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 3 }],
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
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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
      // The counter comes from the groupBy and takes the stamp-less rows in;
      // the average comes from the delivered-orders read, which does not. With
      // no range the two divisors legitimately differ, so averageOrderValue
      // times deliveredOrdersCount is not the period revenue.
      mockReads({
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 3 }],
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
      // Two reads only — the counters and the assigned counters. The history
      // query is not issued when the answer is free.
      expect(prismaMock.order.groupBy).toHaveBeenCalledTimes(2);
    });

    it("should count a customer once, however many deliveries they took in the period", async () => {
      const customerId = "customer-served-twice";

      mockReads({
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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

    it("should discount what restocking cost from what the period invoiced", async () => {
      mockReads({
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 2 }],
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

      const { revenue, restockCost, profit, profitPercentage } =
        await service.findSummary({});

      // The cost is the movement lines' price times quantity, and the margin is
      // read over the revenue, never over the gross.
      expect(revenue).toBe(6300);
      expect(restockCost).toBe(2500);
      expect(profit).toBe(3800);
      expect(profitPercentage).toBe(60.32);
    });

    it("should report a negative profit when restocking cost more than the period invoiced", async () => {
      mockReads({
        statusGroups: [{ status: OrderStatus.DELIVERED, _count: 1 }],
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

    it("should count every order, not only the ones that reached a delivery person", async () => {
      mockReads();

      await service.findSummary({});

      const [[groupByArgs]] = prismaMock.order.groupBy.mock.calls;

      // Grouping by the delivery person too would reduce to the same counters
      // and pass every assertion below, while silently costing a wider grouping.
      expect(groupByArgs.by).toEqual(["status"]);
      // The assignment filter is what narrows the performance reading; this one
      // counts an order cancelled while still PENDING too.
      expect(groupByArgs.where).toEqual({
        OR: [
          { status: OrderStatus.DELIVERED, deliveredAt: undefined },
          { status: OrderStatus.CANCELLED, cancelledAt: undefined },
        ],
      });
    });

    it("should pair the range with each status own closing stamp", async () => {
      const startDate = at("00:00:00");
      const endDate = at("23:59:59");

      mockReads();

      await service.findSummary({ startDate, endDate });

      const [[groupByArgs]] = prismaMock.order.groupBy.mock.calls;

      expect(groupByArgs.where.OR).toEqual([
        {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: startDate, lte: endDate },
        },
        {
          status: OrderStatus.CANCELLED,
          cancelledAt: { gte: startDate, lte: endDate },
        },
      ]);
    });
  });
});
