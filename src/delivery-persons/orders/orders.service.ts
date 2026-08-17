import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { computeOrderTotals } from "@shared/helpers/products-totals";

@Injectable()
export class DeliveryPersonsOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findShippedOrders(deliveryPersonId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryPersonId,
        status: OrderStatus.SHIPPED,
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return orders.map((order) => ({
      ...order,
      ...computeOrderTotals(order),
    }));
  }
}
