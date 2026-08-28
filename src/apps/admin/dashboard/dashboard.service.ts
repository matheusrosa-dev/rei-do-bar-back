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
import { FindDeliveryPersonsPerformanceDto, FindRevenueDto } from "./dtos";

type RevenueOrder = OrderTotalsSource & {
  deliveredAt: Date | null;
};

type RevenueSums = {
  revenue: number;
  couponDiscount: number;
};

type OrderGroup = {
  deliveryPersonId: string | null;
  status: OrderStatus;
  _count: number;
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
        ...this.buildTotals(groups),
        ...this.buildAverageTimings(shippedOrders),
      },
      deliveryPersons: this.buildDeliveryPersons(deliveryPersons, groups),
    };
  }

  async findRevenue(dto: FindRevenueDto) {
    const deliveredAt = this.buildDateRange(dto);

    const orders = await this.prisma.order.findMany({
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

    return {
      totals: {
        deliveredOrdersCount: orders.length,
        ...this.buildRevenueTotals(orders),
      },
      series: this.buildRevenueSeries(orders, dto),
    };
  }

  private buildRevenueTotals(orders: OrderTotalsSource[]) {
    const sums = this.sumRevenue(orders);

    const grossRevenue = sums.revenue + sums.couponDiscount;

    const couponDiscountPercentage =
      grossRevenue === 0
        ? null
        : Math.round((sums.couponDiscount / grossRevenue) * 10_000) / 100;

    return {
      ...sums,
      couponDiscountPercentage,
    };
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

  private buildRevenueSeries(orders: RevenueOrder[], range: DateRange) {
    const series = listDataByDateUnit(
      orders.map((order) => ({ date: order.deliveredAt!, data: order })),
      range,
    );

    return series.map((serie) => ({
      label: serie.label,
      deliveredOrdersCount: serie.data.length,
      ...this.buildRevenueTotals(serie.data),
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

  private buildClosedOrdersWhere(
    dto: FindDeliveryPersonsPerformanceDto,
  ): Prisma.OrderWhereInput {
    const closedAt = this.buildDateRange(dto);

    return {
      deliveryPersonId: { not: null },
      OR: [
        { status: OrderStatus.DELIVERED, deliveredAt: closedAt },
        { status: OrderStatus.CANCELLED, cancelledAt: closedAt },
      ],
    };
  }

  private buildTotals(groups: OrderGroup[]) {
    const deliveredOrdersCount = this.countByStatus(
      groups,
      OrderStatus.DELIVERED,
    );
    const cancelledOrdersCount = this.countByStatus(
      groups,
      OrderStatus.CANCELLED,
    );

    return {
      totalOrdersCount: deliveredOrdersCount + cancelledOrdersCount,
      deliveredOrdersCount,
      cancelledOrdersCount,
    };
  }

  private countByStatus(groups: OrderGroup[], status: OrderStatus) {
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
