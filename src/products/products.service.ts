import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestSellers(deviceId: string, category?: string) {
    const [bestSellers, customer] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          deletedAt: null,
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
      this.prisma.customer.findUnique({
        where: { deviceId },
        select: {
          cart: {
            select: {
              items: {
                select: { productId: true, quantity: true },
              },
            },
          },
        },
      }),
    ]);

    const quantityInCart = this.calculateQuantityInCart(
      customer?.cart?.items ?? [],
    );

    return bestSellers.map((product) => {
      return {
        ...product,
        quantityInCart: quantityInCart[product.id] || 0,
        remainingStock: product.stock <= 10 ? product.stock : null,
      };
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
