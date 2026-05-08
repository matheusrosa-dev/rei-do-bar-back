import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";

// enum Status {
//   soldOut = "SOLD_OUT",
//   lowStock = "LOW_STOCK",
//   inStock = "IN_STOCK",
// }

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestSellers(deviceId: string) {
    // TODO: implementar lógica real de best sellers
    const bestSellers = await this.prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        stock: true,
      },
    });

    //TODO: implementar logica de stock

    const customer = await this.prisma.customer.findUnique({
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
    });

    const quantityInCart =
      customer?.cart?.items.reduce(
        (acc, item) => {
          const key = item.productId;

          acc[key] = (acc[key] || 0) + item.quantity;

          return acc;
        },
        {} as Record<string, number>,
      ) ?? {};

    return bestSellers.map((product) => {
      // let status = Status.inStock;

      // if (product.stock === 0) {
      //   status = Status.soldOut;
      // } else if (product.stock <= 10) {
      //   status = Status.lowStock;
      // }

      return {
        ...product,
        quantityInCart: quantityInCart[product.id] || 0,
        // status,
        // remainingStock: product.stock <= 10 ? product.stock : undefined,
      };
    });
  }
}
