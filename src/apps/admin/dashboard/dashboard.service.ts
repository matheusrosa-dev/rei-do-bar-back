import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindDeliveryPersonsPerformanceDto } from "./dtos";

const MINUTE_IN_MS = 60 * 1000;

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

  private buildClosedOrdersWhere({
    startDate,
    endDate,
  }: FindDeliveryPersonsPerformanceDto): Prisma.OrderWhereInput {
    let closedAt: Prisma.DateTimeNullableFilter | undefined;

    if (startDate || endDate) {
      closedAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

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
      averageDeliveryMinutes: this.averageMinutes(
        this.spansSinceShipping(orders, OrderStatus.DELIVERED),
      ),
      averageCancellationAfterShippingMinutes: this.averageMinutes(
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

  private averageMinutes(spans: number[]) {
    if (spans.length === 0) {
      return null;
    }

    const total = spans.reduce((sum, span) => sum + span, 0);

    return Math.round(total / spans.length / MINUTE_IN_MS);
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
