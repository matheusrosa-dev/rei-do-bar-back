import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";

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
      },
    });

    //TODO: implementar logica de stock

    return bestSellers.map((product) => ({
      ...product,
      isInCart: false, // TODO: implementar lógica real para verificar se o produto está no carrinho do usuário
    }));
  }
}
