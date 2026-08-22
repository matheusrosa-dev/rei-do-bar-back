import { Injectable } from "@nestjs/common";

import { PrismaService } from "@shared/database/prisma/prisma.service";
import type { ICurrentSession } from "@shared/types/jwt";
import { FindBestSellersDto } from "./dtos";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestSellers(session: ICurrentSession, dto?: FindBestSellersDto) {
    const [bestSellers, customerOrAnonymous] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          ...(dto?.category ? { category: { name: dto.category } } : {}),
          ...(dto?.searchTerm
            ? {
                OR: [
                  { name: { contains: dto.searchTerm, mode: "insensitive" } },
                  {
                    description: {
                      contains: dto.searchTerm,
                      mode: "insensitive",
                    },
                  },
                  {
                    category: {
                      name: {
                        contains: dto.searchTerm,
                        mode: "insensitive",
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          compareAtPrice: true,
          price: true,
          imageUrl: true,
          stockQuantity: true,
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
        remainingStock:
          product.stockQuantity <= 10 ? product.stockQuantity : null,
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

    if (session?.customerId) {
      return this.prisma.customer.findFirst({
        where: { id: session.customerId },
        select,
      });
    }

    return this.prisma.anonymousCustomer.findUnique({
      where: { deviceId: session.deviceId },
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
