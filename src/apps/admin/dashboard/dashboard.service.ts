import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  InventoryMovementOrigin,
  OrderStatus,
} from "@shared/database/prisma/generated/enums";
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
  FindAccountsSeriesDto,
  FindDeliveryPersonsPerformanceDto,
  FindSeriesDto,
  FindSummaryDto,
} from "./dtos";

type DeliveredOrder = OrderTotalsSource & {
  customerId: string;
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
  _sum: { deliveryFee: number | null };
};

type ShippedOrderTiming = {
  shippedAt: Date | null;
  deliveredAt: Date | null;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountsSeries(dto: FindAccountsSeriesDto) {
    const createdAt = this.buildDateRange(dto);

    const [anonymousCustomers, customers] = await Promise.all([
      this.prisma.anonymousCustomer.findMany({
        where: { createdAt },
        select: { createdAt: true },
      }),
      this.prisma.customer.findMany({
        where: { createdAt },
        select: { createdAt: true },
      }),
    ]);

    const buckets = listDataByDateUnit(
      [
        ...anonymousCustomers.map((anonymousCustomer) => ({
          date: anonymousCustomer.createdAt,
          data: "ANONYMOUS" as const,
        })),
        ...customers.map((customer) => ({
          date: customer.createdAt,
          data: "CUSTOMER" as const,
        })),
      ],
      dto,
    );

    return {
      series: buckets.map(({ label, data }) => ({
        label,
        newAnonymousCustomersCount: data.filter(
          (origin) => origin === "ANONYMOUS",
        ).length,
        newCustomersCount: data.filter((origin) => origin === "CUSTOMER")
          .length,
      })),
    };
  }

  async findDeliveryPersonsPerformance(dto: FindDeliveryPersonsPerformanceDto) {
    const where = this.buildAssignedClosedFilter(dto);

    const { groups, deliveryPersons } = await this.findRosterWithCounts(where);

    return {
      deliveryPersons: this.buildDeliveryPersons(deliveryPersons, groups),
    };
  }

  async findSeries(dto: FindSeriesDto) {
    const orders = await this.findDeliveredOrders(dto);
    const firstDeliveries = await this.findFirstDeliveries(orders, dto);

    const buckets = listDataByDateUnit(
      orders.map((order) => ({ date: order.deliveredAt!, data: order })),
      dto,
    );

    return {
      series: buckets.map((bucket) => ({
        label: bucket.label,
        ...this.buildSeriesPoint(bucket.data, firstDeliveries),
      })),
    };
  }

  async findSummary(dto: FindSummaryDto) {
    const [
      deliveredOrdersCount,
      orders,
      newCustomersCount,
      restockCost,
      failedDeliveriesCount,
      shippedOrders,
    ] = await Promise.all([
      this.prisma.order.count({
        where: this.buildStatusFilter(OrderStatus.DELIVERED, dto),
      }),
      this.findDeliveredOrders(dto),
      this.prisma.customer.count({
        where: { createdAt: this.buildDateRange(dto) },
      }),
      this.sumRestockCost(dto),
      this.prisma.order.count({
        where: {
          deliveryPersonId: { not: null },
          ...this.buildStatusFilter(OrderStatus.CANCELLED, dto),
        },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryPersonId: { not: null },
          ...this.buildStatusFilter(OrderStatus.DELIVERED, dto),
          shippedAt: { not: null },
        },
        select: {
          shippedAt: true,
          deliveredAt: true,
        },
      }),
    ]);

    const sums = this.sumRevenue(orders);
    const { averageOrderValue } = this.buildOrdersTotals(orders.length, sums);

    const highestOrderValue = orders.reduce(
      (highest, order) => Math.max(highest, computeOrderTotals(order).total),
      0,
    );

    const firstDeliveries = await this.findFirstDeliveries(orders, dto);

    return {
      deliveredOrdersCount,
      failedDeliveriesCount,
      averageOrderValue,
      highestOrderValue,
      redeemedCouponOrdersCount: this.countRedeemedCouponOrders(orders),
      firstDeliveredOrdersCount: firstDeliveries.size,
      newCustomersCount,
      averageDeliveryMinutes: averageMinutes(
        this.spansSinceShipping(shippedOrders),
      ),
      revenue: sums.revenue,
      ...this.buildProfitTotals(sums.revenue, restockCost),
      ...this.buildCouponTotals(sums),
    };
  }

  private async findRosterWithCounts(where: Prisma.OrderWhereInput) {
    const groups = await this.prisma.order.groupBy({
      by: ["deliveryPersonId", "status"],
      where,
      _count: true,
      _sum: { deliveryFee: true },
    });

    const deliveryPersonIds = new Set(
      groups.map((group) => group.deliveryPersonId!),
    );

    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: { id: { in: [...deliveryPersonIds] } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return { groups, deliveryPersons };
  }

  private findDeliveredOrders(range: DateRange) {
    const deliveredAt = this.buildDateRange(range);

    return this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: deliveredAt ?? { not: null },
      },
      select: {
        customerId: true,
        deliveredAt: true,
        deliveryFee: true,
        couponDiscount: true,
        items: {
          select: { price: true, compareAtPrice: true, quantity: true },
        },
      },
    });
  }

  private async sumRestockCost(range: DateRange) {
    const movementProducts =
      await this.prisma.inventoryMovementProduct.findMany({
        where: {
          inventoryMovement: {
            origin: InventoryMovementOrigin.ADMIN_RESTOCK,
            createdAt: this.buildDateRange(range),
          },
        },
        select: { price: true, quantity: true },
      });

    return movementProducts.reduce(
      (sum, { price, quantity }) => sum + price * quantity,
      0,
    );
  }

  private buildSeriesPoint(
    orders: DeliveredOrder[],
    firstDeliveries: Map<string, number>,
  ) {
    const sums = this.sumRevenue(orders);

    return {
      ...this.buildOrdersTotals(orders.length, sums),
      firstDeliveredOrdersCount: this.countFirstDeliveries(
        orders,
        firstDeliveries,
      ),
      redeemedCouponOrdersCount: this.countRedeemedCouponOrders(orders),
      revenue: sums.revenue,
      ...this.buildCouponTotals(sums),
    };
  }

  private buildProfitTotals(revenue: number, restockCost: number) {
    const profit = revenue - restockCost;

    const profitPercentage =
      revenue === 0 ? 0 : Math.round((profit / revenue) * 10_000) / 100;

    return {
      restockCost,
      profit,
      profitPercentage,
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

  private async findFirstDeliveries(
    orders: DeliveredOrder[],
    { startDate }: DateRange,
  ) {
    const earliestByCustomer = new Map<string, number>();

    for (const order of orders) {
      const deliveredAt = order.deliveredAt!.getTime();
      const current = earliestByCustomer.get(order.customerId);

      if (current === undefined || deliveredAt < current) {
        earliestByCustomer.set(order.customerId, deliveredAt);
      }
    }

    if (!startDate || earliestByCustomer.size === 0) {
      return earliestByCustomer;
    }

    const groups = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: { not: null },
        customerId: { in: [...earliestByCustomer.keys()] },
      },
      _min: { deliveredAt: true },
    });

    const firstDeliveries = groups.filter(
      (group) =>
        group._min.deliveredAt?.getTime() ===
        earliestByCustomer.get(group.customerId),
    );

    return new Map(
      firstDeliveries.map((group) => [
        group.customerId,
        earliestByCustomer.get(group.customerId)!,
      ]),
    );
  }

  private countFirstDeliveries(
    orders: DeliveredOrder[],
    firstDeliveries: Map<string, number>,
  ) {
    const customerIds = new Set<string>();

    for (const order of orders) {
      if (
        firstDeliveries.get(order.customerId) === order.deliveredAt!.getTime()
      ) {
        customerIds.add(order.customerId);
      }
    }

    return customerIds.size;
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

  private buildDateRange({
    startDate,
    endDate,
  }: DateRange): { gte?: Date; lte?: Date } | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };
  }

  private buildStatusFilter(
    status: typeof OrderStatus.DELIVERED | typeof OrderStatus.CANCELLED,
    range: DateRange,
  ): Prisma.OrderWhereInput {
    const closedAt = this.buildDateRange(range);

    return status === OrderStatus.DELIVERED
      ? { status, deliveredAt: closedAt }
      : { status, cancelledAt: closedAt };
  }

  private buildClosedStatusFilter(range: DateRange): Prisma.OrderWhereInput[] {
    return [
      this.buildStatusFilter(OrderStatus.DELIVERED, range),
      this.buildStatusFilter(OrderStatus.CANCELLED, range),
    ];
  }

  private buildAssignedClosedFilter(range: DateRange): Prisma.OrderWhereInput {
    return {
      deliveryPersonId: { not: null },
      OR: this.buildClosedStatusFilter(range),
    };
  }

  private spansSinceShipping(orders: ShippedOrderTiming[]) {
    const spans: number[] = [];

    for (const order of orders) {
      if (!order.shippedAt) {
        continue;
      }

      if (order.deliveredAt) {
        spans.push(order.deliveredAt.getTime() - order.shippedAt.getTime());
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

    const deliveryFeeByPerson = new Map<string, number>();

    for (const group of groups) {
      const personId = group.deliveryPersonId!;
      const current = deliveryFeeByPerson.get(personId) ?? 0;

      deliveryFeeByPerson.set(
        personId,
        current + (group._sum.deliveryFee ?? 0),
      );
    }

    return deliveryPersons.map(({ id, name }) => ({
      name,
      deliveredOrdersCount:
        countByPersonAndStatus.get(`${id}:${OrderStatus.DELIVERED}`) ?? 0,
      cancelledOrdersCount:
        countByPersonAndStatus.get(`${id}:${OrderStatus.CANCELLED}`) ?? 0,
      deliveryFeeTotal: deliveryFeeByPerson.get(id) ?? 0,
    }));
  }
}
