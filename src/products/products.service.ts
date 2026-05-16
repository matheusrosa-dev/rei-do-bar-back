import { Injectable } from "@nestjs/common";

import { PrismaService } from "@shared/database/prisma/prisma.service";
import type { ICurrentSession } from "@shared/types/jwt";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestSellers(session: ICurrentSession, category?: string) {
    const [bestSellers, customerOrAnonymous] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          ...(category
            ? {
                category: { name: category },
              }
            : {
                sortOrder: {
                  not: null,
                },
              }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          stock: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
      }),
      this.findAnonymousOrCustomerWithCart(session),
    ]);

    const quantityInCart = this.calculateQuantityInCart(
      customerOrAnonymous?.cart?.items ?? [],
    );

    return bestSellers.map((product) => {
      return {
        ...product,
        quantityInCart: quantityInCart[product.id] || 0,
        remainingStock: product.stock <= 10 ? product.stock : null,
      };
    });
  }

  private findAnonymousOrCustomerWithCart(session: ICurrentSession) {
    const select = {
      cart: {
        select: {
          items: {
            select: { productId: true, quantity: true },
          },
        },
      },
    };

    if (
      (!session?.deviceId && !session?.customerId) ||
      (session?.deviceId && session?.customerId)
    ) {
      throw new Error("Session must have either deviceId or customerId");
    }

    if (session?.deviceId) {
      return this.prisma.anonymousCustomer.findUnique({
        where: { deviceId: session.deviceId },
        select,
      });
    }

    return this.prisma.customer.findUnique({
      where: { id: session.customerId, isActive: true },
      select,
    });
  }

  private calculateQuantityInCart(
    items: { productId: string; quantity: number }[],
  ) {
    return items.reduce(
      (acc, item) => {
        const key = item.productId;
        acc[key] = (acc[key] || 0) + item.quantity;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
