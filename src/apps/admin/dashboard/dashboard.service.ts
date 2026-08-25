import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindDeliveryPersonsPerformanceDto } from "./dtos";

type OrderGroup = {
  deliveryPersonId: string | null;
  status: OrderStatus;
  _count: number;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async findDeliveryPersonsPerformance(dto: FindDeliveryPersonsPerformanceDto) {
    const closedAt = this.buildClosedAtRange(dto);

    const groups = await this.prisma.order.groupBy({
      by: ["deliveryPersonId", "status"],
      where: {
        deliveryPersonId: { not: null },
        OR: [
          { status: OrderStatus.DELIVERED, deliveredAt: closedAt },
          { status: OrderStatus.CANCELLED, cancelledAt: closedAt },
        ],
      },
      _count: true,
    });

    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: { id: { in: groups.map((group) => group.deliveryPersonId!) } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return {
      totals: this.buildTotals(groups),
      deliveryPersons: this.buildDeliveryPersons(deliveryPersons, groups),
    };
  }

  private buildClosedAtRange({
    startDate,
    endDate,
  }: FindDeliveryPersonsPerformanceDto):
    | Prisma.DateTimeNullableFilter
    | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };
  }

  private buildTotals(groups: OrderGroup[]) {
    const countByStatus = (status: OrderStatus) =>
      groups
        .filter((group) => group.status === status)
        .reduce((sum, group) => sum + group._count, 0);

    const deliveredOrdersCount = countByStatus(OrderStatus.DELIVERED);
    const cancelledOrdersCount = countByStatus(OrderStatus.CANCELLED);

    return {
      totalOrdersCount: deliveredOrdersCount + cancelledOrdersCount,
      deliveredOrdersCount,
      cancelledOrdersCount,
    };
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
