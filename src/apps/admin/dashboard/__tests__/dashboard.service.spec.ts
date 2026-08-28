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
  deliveredAt: Date | null,
  items: ReturnType<typeof item>[],
  deliveryFee = 0,
  couponDiscount = 0,
) => ({ deliveredAt, items, deliveryFee, couponDiscount });

const middayOf = (isoDate: string) => new Date(`${isoDate}T12:00:00-03:00`);
const startOf = (isoDate: string) => new Date(`${isoDate}T00:00:00-03:00`);
const endOf = (isoDate: string) => new Date(`${isoDate}T23:59:59-03:00`);

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
      // 20min and 21min40s average to 20min50s, which truncates to 20 and rounds
      // to 21; the cancelled pair averages 20min20s and goes the other way.
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
      // A zero would read as "cancelled the instant it left for delivery".
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

      // No write path produces this row today, and that is exactly the point:
      // without the guard, a row like this turns the whole field into NaN.
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
      // Rebuilding the filter on the second read is how the two halves fall out
      // of sync, and an equal copy would still pass the assert above — only
      // identity proves the second read shares the first one's filter.
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
      // Cancelled before it ever left: the averages' where excludes it.
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
        // 2x1000 with compareAtPrice 1200: the product discount (400) comes off
        // the total but does not count as couponDiscount.
        deliveredOrder(middayOf("2026-08-26"), [item(1000, 2, 1200)], 500, 300),
        deliveredOrder(
          middayOf("2026-08-27"),
          [item(1500, 1), item(700, 3)],
          500,
        ),
      ]);

      const { totals } = await service.findRevenue({});

      // (2400 - 400) + 500 - 300 = 2200 | (1500 + 2100) + 500 = 4100
      // The percentage divides by the gross (6300 + 300), not by the revenue:
      // revenue is already net of the coupon.
      expect(totals).toEqual({
        deliveredOrdersCount: 2,
        revenue: 6300,
        couponDiscount: 300,
        couponDiscountPercentage: 4.55,
      });
    });

    it("should sum zeros but answer a null percentage when nothing was delivered in the period", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      // Zero is a legitimate answer for the sums — nothing invoiced. The
      // percentage is a ratio, not a sum: with no gross to divide by there is
      // nothing to measure, and 0% would read as "sold, and gave nothing away".
      expect(await service.findRevenue({})).toEqual({
        totals: {
          deliveredOrdersCount: 0,
          revenue: 0,
          couponDiscount: 0,
          couponDiscountPercentage: null,
        },
        series: [],
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

    it("should still require a delivery stamp when no bound is given", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.findRevenue({});

      const [[findManyArgs]] = prismaMock.order.findMany.mock.calls;

      // The default is lifetime, but a delivered order with no stamp belongs to
      // no period: the same query drops it from the total and the series, which
      // is what keeps both halves over the same set with or without a range.
      expect(findManyArgs.where).toEqual({
        status: OrderStatus.DELIVERED,
        deliveredAt: { not: null },
      });
    });

    it("should bucket by the São Paulo day, not the UTC one", async () => {
      // 01:30Z is 22:30 the previous day in Sao Paulo — the bar's peak hour.
      // Bucketing in UTC would push the delivery to the next day of the chart.
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(new Date("2026-08-27T01:30:00Z"), [item(1000, 1)]),
      ]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-27"),
      });

      expect(series).toEqual([
        {
          label: "26/08",
          deliveredOrdersCount: 1,
          revenue: 1000,
          couponDiscount: 0,
          couponDiscountPercentage: 0,
        },
        {
          label: "27/08",
          deliveredOrdersCount: 0,
          revenue: 0,
          couponDiscount: 0,
          couponDiscountPercentage: null,
        },
      ]);
    });

    it("should bucket by the hour when the range covers a single day", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(new Date("2026-08-26T14:30:00-03:00"), [item(1000, 1)]),
        deliveredOrder(new Date("2026-08-26T20:45:00-03:00"), [item(3000, 1)]),
      ]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-26"),
      });

      // The bucket key has to carry the hour: with toISODate() all 24 hours of
      // the day fall into one key and the series becomes one point, labelled 00:00.
      expect(series).toHaveLength(24);
      expect(series[0].label).toBe("00:00");
      expect(series[23].label).toBe("23:00");
      expect(series[14]).toEqual({
        label: "14:00",
        deliveredOrdersCount: 1,
        revenue: 1000,
        couponDiscount: 0,
        couponDiscountPercentage: 0,
      });
      expect(series[20].revenue).toBe(3000);
    });

    it("should still bucket by day at exactly 62 days of range", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-07-01"),
        endDate: endOf("2026-08-31"),
      });

      // With no granularity field in the payload, the label's format is what
      // makes the threshold observable.
      expect(series).toHaveLength(62);
      expect(series[0].label).toBe("01/07");
      expect(series[61].label).toBe("31/08");
    });

    it("should switch to monthly buckets one day past the threshold", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-06-30"),
        endDate: endOf("2026-08-31"),
      });

      expect(series.map(({ label }) => label)).toEqual([
        "Junho/2026",
        "Julho/2026",
        "Agosto/2026",
      ]);
    });

    it("should collapse different days of the same month into one monthly point", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-03"), [item(1000, 1)], 0, 100),
        deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
      ]);

      const { series } = await service.findRevenue({});

      expect(series).toEqual([
        {
          label: "Agosto/2026",
          deliveredOrdersCount: 2,
          revenue: 2900,
          couponDiscount: 100,
          couponDiscountPercentage: 3.33,
        },
      ]);
    });

    it("should zero-fill an empty bucket in the middle of a closed range", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)]),
        deliveredOrder(middayOf("2026-08-28"), [item(3000, 1)]),
      ]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      // Without the zeroed day the line cuts straight from 1000 to 3000 and
      // hides the idle day.
      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["26/08", 1000],
        ["27/08", 0],
        ["28/08", 3000],
      ]);
    });

    it("should list sparse monthly buckets ascending regardless of the row order", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
        deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)]),
      ]);

      const { series } = await service.findRevenue({});

      // With no bound there is no interval to fill: July does not appear, and
      // the position in the array is the only ordering contract left.
      expect(series.map(({ label }) => label)).toEqual([
        "Junho/2026",
        "Agosto/2026",
      ]);
    });

    it("should stay sparse and monthly when only one bound is given", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
      ]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-08-01"),
      });

      // An open-ended interval has no end to fill up to.
      expect(series.map(({ label }) => label)).toEqual(["Agosto/2026"]);
    });

    it("should keep totals equal to the sum of the series over a closed range", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-26"), [item(1000, 2, 1200)], 500, 300),
        deliveredOrder(middayOf("2026-08-28"), [item(1500, 1)], 500),
      ]);

      const { totals, series } = await service.findRevenue({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      const summed = series.reduce(
        (sums, point) => ({
          deliveredOrdersCount:
            sums.deliveredOrdersCount + point.deliveredOrdersCount,
          revenue: sums.revenue + point.revenue,
          couponDiscount: sums.couponDiscount + point.couponDiscount,
        }),
        { deliveredOrdersCount: 0, revenue: 0, couponDiscount: 0 },
      );

      // The percentage is left out on purpose: it is a ratio, so it is neither
      // the sum nor the average of the points — see the test below.
      const { couponDiscountPercentage, ...summableTotals } = totals;

      // 300 / (4200 + 300), recomputed from the period's own gross.
      expect(summed).toEqual(summableTotals);
      expect(couponDiscountPercentage).toBe(6.67);
    });

    it("should recompute the percentage over each bucket's own gross, never summing or averaging the points", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-08-26"), [item(1000, 1)], 0, 500),
        deliveredOrder(middayOf("2026-08-28"), [item(9000, 1)]),
      ]);

      const { totals, series } = await service.findRevenue({
        startDate: startOf("2026-08-26"),
        endDate: endOf("2026-08-28"),
      });

      // 500/1000, nothing, 0/9000 — and the period as a whole is 500/10000, so
      // it is neither the sum of the points (50) nor their average (25).
      expect(
        series.map(({ label, couponDiscountPercentage }) => [
          label,
          couponDiscountPercentage,
        ]),
      ).toEqual([
        ["26/08", 50],
        ["27/08", null],
        ["28/08", 0],
      ]);
      expect(totals.couponDiscountPercentage).toBe(5);
    });

    it("should zero-fill an empty month between two months that had deliveries", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)]),
        deliveredOrder(middayOf("2026-08-27"), [item(3000, 1)]),
      ]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-06-01"),
        endDate: endOf("2026-08-31"),
      });

      // Dense filling has to hold at monthly granularity too, not only daily.
      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["Junho/2026", 1000],
        ["Julho/2026", 0],
        ["Agosto/2026", 3000],
      ]);
    });

    it("should return an empty series for an inverted range", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-08-28"),
        endDate: endOf("2026-08-26"),
      });

      expect(series).toEqual([]);
    });

    it("should return an empty series when the inversion stays inside one bucket", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      // Without the guard both bounds collapse onto the same startOf() and the
      // loop emits one zeroed point, making the inverted case depend on crossing
      // a boundary.
      const { series } = await service.findRevenue({
        startDate: new Date("2026-08-10T10:00:00-03:00"),
        endDate: new Date("2026-08-10T08:00:00-03:00"),
      });

      expect(series).toEqual([]);
    });

    it("should place an order delivered exactly on a bound in the bucket of that bound", async () => {
      const startDate = startOf("2026-08-26");
      const endDate = endOf("2026-08-27");

      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(startDate, [item(1000, 1)]),
        deliveredOrder(endDate, [item(3000, 1)]),
      ]);

      const { series } = await service.findRevenue({ startDate, endDate });

      expect(series.map(({ label, revenue }) => [label, revenue])).toEqual([
        ["26/08", 1000],
        ["27/08", 3000],
      ]);
    });

    it("should terminate and cap the series on an absurd but valid range", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const { series } = await service.findRevenue({
        startDate: startOf("2026-01-01"),
        endDate: endOf("9999-12-31"),
      });

      // Past 9999 luxon emits the expanded year ("+010000-01-01"), and "+" sorts
      // below every digit: comparing the dates as strings made the loop never
      // end and take the process down.
      expect(series).toHaveLength(600);
      expect(series[0].label).toBe("Janeiro/2026");
    });

    it("should keep totals equal to the sum of the series with no bound at all", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        deliveredOrder(middayOf("2026-06-10"), [item(1000, 1)], 0, 100),
        deliveredOrder(middayOf("2026-08-27"), [item(2000, 1)]),
      ]);

      const { totals, series } = await service.findRevenue({});

      // Since the query excludes the null stamp, no order counts in the total
      // without belonging to a bucket: the equality holds even with no range.
      expect(series).toHaveLength(2);
      expect(totals.deliveredOrdersCount).toBe(
        series.reduce((sum, point) => sum + point.deliveredOrdersCount, 0),
      );
      expect(totals.revenue).toBe(
        series.reduce((sum, point) => sum + point.revenue, 0),
      );
    });
  });
});
