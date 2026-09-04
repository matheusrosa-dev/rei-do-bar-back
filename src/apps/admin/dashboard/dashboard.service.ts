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
  FindRankingsDto,
  FindSeriesDto,
  FindSummaryDto,
} from "./dtos";

type DeliveredOrder = OrderTotalsSource & {
  customerId: string;
  deliveredAt: Date | null;
  deliveryPersonIsVolunteer: boolean;
};

type RevenueSums = {
  revenue: number;
  couponDiscount: number;
  deliveryFeeTotal: number;
  volunteeredDeliveryFeeTotal: number;
};

type StatusGroup = {
  status: OrderStatus;
  _count: number;
};

type OrderGroup = StatusGroup & {
  deliveryPersonId: string | null;
  deliveryPersonIsVolunteer: boolean;
  _sum: { deliveryFee: number | null; deliveryPersonBonus: number | null };
};

type ProductGroup = {
  productId: string;
  _count: number;
  _sum: { quantity: number | null };
};

type ShippedOrderTiming = {
  shippedAt: Date | null;
  deliveredAt: Date | null;
};

const RANKING_SIZE = 5;

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

  async findRankings(dto: FindRankingsDto) {
    const delivered = this.buildDeliveredFilter(dto);

    const [productGroups, couponGroups] = await Promise.all([
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: delivered },
        _count: true,
        _sum: { quantity: true },
        orderBy: [{ _sum: { quantity: "desc" } }, { productId: "asc" }],
        take: RANKING_SIZE,
      }),
      this.prisma.order.groupBy({
        by: ["couponCode"],
        where: { ...delivered, couponCode: { not: null } },
        _count: true,
        _sum: { couponDiscount: true },
        orderBy: [{ _count: { couponCode: "desc" } }, { couponCode: "asc" }],
        take: RANKING_SIZE,
      }),
    ]);

    const products = await this.prisma.product.findMany({
      where: { id: { in: productGroups.map((group) => group.productId) } },
      select: { id: true, name: true, imageUrl: true },
    });

    return {
      products: this.buildRankedProducts(productGroups, products),
      coupons: couponGroups.map((group) => ({
        code: group.couponCode!,
        ordersCount: group._count,
        discountTotal: group._sum.couponDiscount ?? 0,
      })),
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
      deliveryPersonBonuses,
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
      this.sumDeliveryPersonBonuses(dto),
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
      deliveryFeeTotal: sums.deliveryFeeTotal,
      deliveryPersonBonusTotal: deliveryPersonBonuses.paid,
      volunteeredSavingsTotal:
        deliveryPersonBonuses.volunteered + sums.volunteeredDeliveryFeeTotal,
      ...this.buildProfitTotals(sums, restockCost, deliveryPersonBonuses.paid),
      ...this.buildCouponTotals(sums),
    };
  }

  private async findRosterWithCounts(where: Prisma.OrderWhereInput) {
    const groups = await this.prisma.order.groupBy({
      by: ["deliveryPersonId", "status", "deliveryPersonIsVolunteer"],
      where,
      _count: true,
      _sum: { deliveryFee: true, deliveryPersonBonus: true },
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
    return this.prisma.order.findMany({
      where: this.buildDeliveredFilter(range),
      select: {
        customerId: true,
        deliveredAt: true,
        deliveryFee: true,
        deliveryPersonIsVolunteer: true,
        couponDiscount: true,
        items: {
          select: { price: true, compareAtPrice: true, quantity: true },
        },
      },
    });
  }

  private async sumDeliveryPersonBonuses(range: DateRange) {
    const groups = await this.prisma.order.groupBy({
      by: ["deliveryPersonIsVolunteer"],
      where: this.buildAssignedClosedFilter(range),
      _sum: { deliveryPersonBonus: true },
    });

    let paid = 0;
    let volunteered = 0;

    for (const group of groups) {
      const bonus = group._sum.deliveryPersonBonus ?? 0;

      if (group.deliveryPersonIsVolunteer) {
        volunteered += bonus;
        continue;
      }

      paid += bonus;
    }

    return { paid, volunteered };
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

  private buildProfitTotals(
    { revenue, deliveryFeeTotal }: RevenueSums,
    restockCost: number,
    deliveryPersonBonusTotal: number,
  ) {
    const profit =
      revenue - restockCost - deliveryFeeTotal - deliveryPersonBonusTotal;

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

  private sumRevenue(orders: DeliveredOrder[]): RevenueSums {
    return orders.reduce(
      (sums, order) => ({
        revenue: sums.revenue + computeOrderTotals(order).total,
        couponDiscount: sums.couponDiscount + order.couponDiscount,
        // The fee is split so `profit` only nets out what was handed over: a
        // volunteer's fee is charged to the customer and kept by the store.
        deliveryFeeTotal:
          sums.deliveryFeeTotal +
          (order.deliveryPersonIsVolunteer ? 0 : order.deliveryFee),
        volunteeredDeliveryFeeTotal:
          sums.volunteeredDeliveryFeeTotal +
          (order.deliveryPersonIsVolunteer ? order.deliveryFee : 0),
      }),
      {
        revenue: 0,
        couponDiscount: 0,
        deliveryFeeTotal: 0,
        volunteeredDeliveryFeeTotal: 0,
      },
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

  private buildDeliveredFilter(range: DateRange): Prisma.OrderWhereInput {
    return {
      status: OrderStatus.DELIVERED,
      deliveredAt: this.buildDateRange(range) ?? { not: null },
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

  private buildRankedProducts(
    groups: ProductGroup[],
    products: { id: string; name: string; imageUrl: string }[],
  ) {
    const productById = new Map(
      products.map((product) => [product.id, product] as const),
    );

    return groups.map((group) => {
      const product = productById.get(group.productId)!;

      return {
        name: product.name,
        imageUrl: product.imageUrl,
        soldQuantity: group._sum.quantity ?? 0,
        // `@@unique([orderId, productId])` keeps one line per product per
        // order, so the group's row count is how many orders it appeared in.
        ordersCount: group._count,
      };
    });
  }

  private buildDeliveryPersons(
    deliveryPersons: { id: string; name: string }[],
    groups: OrderGroup[],
  ) {
    const deliveredCountByPerson = new Map<string, number>();
    const volunteeredCountByPerson = new Map<string, number>();
    const cancelledCountByPerson = new Map<string, number>();
    const deliveredFeeByPerson = new Map<string, number>();
    const bonusByPerson = new Map<string, number>();
    const volunteeredSavingsByPerson = new Map<string, number>();

    for (const group of groups) {
      const personId = group.deliveryPersonId!;
      const fee = group._sum.deliveryFee ?? 0;
      const bonus = group._sum.deliveryPersonBonus ?? 0;
      const isDelivered = group.status === OrderStatus.DELIVERED;

      if (group.deliveryPersonIsVolunteer) {
        // What the volunteer's orders would have cost: bonus on every closed
        // order, delivery fee only on the delivered ones — mirroring how the
        // paid fields below are scoped.
        volunteeredSavingsByPerson.set(
          personId,
          (volunteeredSavingsByPerson.get(personId) ?? 0) +
            bonus +
            (isDelivered ? fee : 0),
        );

        if (isDelivered) {
          volunteeredCountByPerson.set(
            personId,
            (volunteeredCountByPerson.get(personId) ?? 0) + group._count,
          );
          continue;
        }

        cancelledCountByPerson.set(
          personId,
          (cancelledCountByPerson.get(personId) ?? 0) + group._count,
        );
        continue;
      }

      bonusByPerson.set(personId, (bonusByPerson.get(personId) ?? 0) + bonus);

      if (!isDelivered) {
        cancelledCountByPerson.set(
          personId,
          (cancelledCountByPerson.get(personId) ?? 0) + group._count,
        );
        continue;
      }

      deliveredCountByPerson.set(
        personId,
        (deliveredCountByPerson.get(personId) ?? 0) + group._count,
      );
      deliveredFeeByPerson.set(
        personId,
        (deliveredFeeByPerson.get(personId) ?? 0) + fee,
      );
    }

    return deliveryPersons.map(({ id, name }) => {
      const deliveryFeeTotal = deliveredFeeByPerson.get(id) ?? 0;
      const deliveryPersonBonusTotal = bonusByPerson.get(id) ?? 0;

      return {
        name,
        deliveredOrdersCount: deliveredCountByPerson.get(id) ?? 0,
        volunteeredDeliveriesCount: volunteeredCountByPerson.get(id) ?? 0,
        cancelledOrdersCount: cancelledCountByPerson.get(id) ?? 0,
        deliveryFeeTotal,
        deliveryPersonBonusTotal,
        payoutTotal: deliveryFeeTotal + deliveryPersonBonusTotal,
        volunteeredSavingsTotal: volunteeredSavingsByPerson.get(id) ?? 0,
      };
    });
  }
}
