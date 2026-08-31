import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  averageMinutes,
  DateRange,
  listDataByDateUnit,
} from "@shared/helpers/date";
import {
  computeOrderTotals,
  OrderTotalsSource,
} from "@shared/helpers/products-totals";
import {
  FindDeliveryPersonsPerformanceDto,
  FindSeriesDto,
  FindSummaryDto,
} from "./dtos";

type DeliveredOrder = OrderTotalsSource & {
  deliveredAt: Date | null;
};

type RevenueSums = {
  revenue: number;
  couponDiscount: number;
};

type StatusGroup = {
  status: OrderStatus;
  _count: number;
};

type OrderGroup = StatusGroup & {
  deliveryPersonId: string | null;
};

type ShippedOrderTiming = {
  status: OrderStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async findDeliveryPersonsPerformance(dto: FindDeliveryPersonsPerformanceDto) {
    const where = this.buildClosedOrdersWhere(dto);

    const groups = await this.prisma.order.groupBy({
      by: ["deliveryPersonId", "status"],
      where,
      _count: true,
    });

    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: { id: { in: groups.map((group) => group.deliveryPersonId!) } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const shippedOrders = await this.prisma.order.findMany({
      where: { ...where, shippedAt: { not: null } },
      select: {
        status: true,
        shippedAt: true,
        deliveredAt: true,
        cancelledAt: true,
      },
    });

    return {
      totals: {
        cancelledOrdersCount: this.countByStatus(groups, OrderStatus.CANCELLED),
        ...this.buildAverageTimings(shippedOrders),
      },
      deliveryPersons: this.buildDeliveryPersons(deliveryPersons, groups),
    };
  }

  async findSeries(dto: FindSeriesDto) {
    const orders = await this.findDeliveredOrders(dto);

    return {
      series: this.buildSeries(orders, dto),
    };
  }

  async findSummary(dto: FindSummaryDto) {
    const groups = await this.prisma.order.groupBy({
      by: ["status"],
      where: { OR: this.buildClosedStatusFilter(dto) },
      _count: true,
    });

    const orders = await this.findDeliveredOrders(dto);
    const sums = this.sumRevenue(orders);
    const { averageOrderValue } = this.buildOrdersTotals(orders.length, sums);

    return {
      deliveredOrdersCount: this.countByStatus(groups, OrderStatus.DELIVERED),
      cancelledOrdersCount: this.countByStatus(groups, OrderStatus.CANCELLED),
      averageOrderValue,
      highestOrderValue: this.maxOrderTotal(orders),
      redeemedCouponOrdersCount: this.countRedeemedCouponOrders(orders),
      revenue: sums.revenue,
      ...this.buildCouponTotals(sums),
    };
  }

  private findDeliveredOrders(range: DateRange) {
    const deliveredAt = this.buildDateRange(range);

    return this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: deliveredAt ?? { not: null },
      },
      select: {
        deliveredAt: true,
        deliveryFee: true,
        couponDiscount: true,
        items: {
          select: { price: true, compareAtPrice: true, quantity: true },
        },
      },
    });
  }

  private buildSeriesPoint(orders: OrderTotalsSource[]) {
    const sums = this.sumRevenue(orders);

    return {
      ...this.buildOrdersTotals(orders.length, sums),
      revenue: sums.revenue,
      ...this.buildCouponTotals(sums),
    };
  }

  private buildCouponTotals({ revenue, couponDiscount }: RevenueSums) {
    const grossRevenue = revenue + couponDiscount;

    const couponDiscountPercentage =
      grossRevenue === 0
        ? 0
        : Math.round((couponDiscount / grossRevenue) * 10_000) / 100;

    return {
      couponDiscount,
      couponDiscountPercentage,
    };
  }

  private buildOrdersTotals(
    deliveredOrdersCount: number,
    { revenue }: RevenueSums,
  ) {
    const averageOrderValue =
      deliveredOrdersCount === 0
        ? 0
        : Math.round(revenue / deliveredOrdersCount);

    return {
      deliveredOrdersCount,
      averageOrderValue,
    };
  }

  private maxOrderTotal(orders: OrderTotalsSource[]) {
    return orders.reduce(
      (highest, order) => Math.max(highest, computeOrderTotals(order).total),
      0,
    );
  }

  private countRedeemedCouponOrders(orders: OrderTotalsSource[]) {
    return orders.filter((order) => order.couponDiscount > 0).length;
  }

  private sumRevenue(orders: OrderTotalsSource[]): RevenueSums {
    return orders.reduce(
      (sums, order) => ({
        revenue: sums.revenue + computeOrderTotals(order).total,
        couponDiscount: sums.couponDiscount + order.couponDiscount,
      }),
      { revenue: 0, couponDiscount: 0 },
    );
  }

  private buildSeries(orders: DeliveredOrder[], range: DateRange) {
    const series = listDataByDateUnit(
      orders.map((order) => ({ date: order.deliveredAt!, data: order })),
      range,
    );

    return series.map((serie) => ({
      label: serie.label,
      ...this.buildSeriesPoint(serie.data),
    }));
  }

  private buildDateRange({
    startDate,
    endDate,
  }: DateRange): Prisma.DateTimeNullableFilter | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };
  }

  private buildClosedStatusFilter(range: DateRange): Prisma.OrderWhereInput[] {
    const closedAt = this.buildDateRange(range);

    return [
      { status: OrderStatus.DELIVERED, deliveredAt: closedAt },
      { status: OrderStatus.CANCELLED, cancelledAt: closedAt },
    ];
  }

  private buildClosedOrdersWhere(
    dto: FindDeliveryPersonsPerformanceDto,
  ): Prisma.OrderWhereInput {
    return {
      deliveryPersonId: { not: null },
      OR: this.buildClosedStatusFilter(dto),
    };
  }

  private countByStatus(groups: StatusGroup[], status: OrderStatus) {
    return groups
      .filter((group) => group.status === status)
      .reduce((sum, group) => sum + group._count, 0);
  }

  private buildAverageTimings(orders: ShippedOrderTiming[]) {
    return {
      averageDeliveryMinutes: averageMinutes(
        this.spansSinceShipping(orders, OrderStatus.DELIVERED),
      ),
      averageCancellationAfterShippingMinutes: averageMinutes(
        this.spansSinceShipping(orders, OrderStatus.CANCELLED),
      ),
    };
  }

  private spansSinceShipping(
    orders: ShippedOrderTiming[],
    status: OrderStatus,
  ) {
    const spans: number[] = [];

    for (const order of orders) {
      if (order.status !== status || !order.shippedAt) {
        continue;
      }

      const closedAt =
        status === OrderStatus.DELIVERED
          ? order.deliveredAt
          : order.cancelledAt;

      if (closedAt) {
        spans.push(closedAt.getTime() - order.shippedAt.getTime());
      }
    }

    return spans;
  }

  private buildDeliveryPersons(
    deliveryPersons: { id: string; name: string }[],
    groups: OrderGroup[],
  ) {
    const countByPersonAndStatus = new Map(
      groups.map((group) => [
        `${group.deliveryPersonId}:${group.status}`,
        group._count,
      ]),
    );

    return deliveryPersons.map(({ id, name }) => ({
      name,
      deliveredOrdersCount:
        countByPersonAndStatus.get(`${id}:${OrderStatus.DELIVERED}`) ?? 0,
      cancelledOrdersCount:
        countByPersonAndStatus.get(`${id}:${OrderStatus.CANCELLED}`) ?? 0,
    }));
  }
}
