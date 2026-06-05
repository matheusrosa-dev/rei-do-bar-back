import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindAllProductsDto, UpdateProductBodyDto } from "./dtos";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllProductsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(dto.categoryId && { categoryId: dto.categoryId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    const orderBy = {
      ...(dto.sortKey && { [dto.sortKey]: dto.sortDirection }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: Object.keys(orderBy).length ? orderBy : { updatedAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    return product;
  }

  async updateProduct(productId: string, dto: UpdateProductBodyDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
      },
    });

    return updatedProduct;
  }

  async activateProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        isActive: true,
      },
    });

    return updatedProduct;
  }

  async deactivateProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        isActive: false,
      },
    });

    return updatedProduct;
  }

  async incrementStock(productId: string, amount: number) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        stock: {
          increment: amount,
        },
      },
    });

    return updatedProduct;
  }

  async decrementStock(productId: string, amount: number) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        stock: {
          decrement: amount,
        },
      },
    });

    return updatedProduct;
  }
}
