import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import {
  CreateProductDto,
  FindAllProductsDto,
  UpdateProductBodyDto,
  UpdateProductsOrderDto,
} from "./dtos";
import { ProductOrderByWithRelationInput } from "@shared/database/prisma/generated/models";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllProductsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,

      ...(dto.categoryId && { categoryId: dto.categoryId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.searchTerm && {
        OR: [
          { name: { contains: dto.searchTerm, mode: "insensitive" } },
          {
            description: {
              contains: dto.searchTerm,
              mode: "insensitive",
            },
          },
          { id: { contains: dto.searchTerm, mode: "insensitive" } },
          {
            category: {
              name: {
                contains: dto.searchTerm,
                mode: "insensitive",
              },
            },
          },
        ],
      }),
    };

    const orderBy: ProductOrderByWithRelationInput = {
      ...(dto.sortKey && { [dto.sortKey]: dto.sortDirection }),
      ...(!dto.sortKey && { createdAt: "desc" }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: true,
        },
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

  async findAllToSort() {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    return products;
  }

  async updateProductsOrder(dto: UpdateProductsOrderDto) {
    const existingProducts = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    const existingIds = new Set(existingProducts.map((p) => p.id));
    const isValid =
      dto.orderedIds.length === existingIds.size &&
      new Set(dto.orderedIds).size === dto.orderedIds.length &&
      dto.orderedIds.every((id) => existingIds.has(id));

    if (!isValid) {
      throw new AppException(
        AppException.errorCodes.adminProducts.INVALID_PRODUCTS_ORDER,
        "Lista de produtos inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.product.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return this.findAllToSort();
  }

  async findById(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new AppException(
        AppException.errorCodes.adminProducts.PRODUCT_NOT_FOUND,
        "Produto não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return product;
  }

  async createProduct(dto: CreateProductDto) {
    try {
      const last = await this.prisma.product.findFirst({
        where: { deletedAt: null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          imageUrl: dto.imageUrl,
          isActive: false,
          stock: 0,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          category: {
            connect: {
              id: dto.categoryId,
            },
          },
        },
        include: {
          category: true,
        },
      });

      return product;
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminProducts.INVALID_CATEGORY,
          "Categoria inválida.",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      throw error;
    }
  }

  async updateProduct(productId: string, dto: UpdateProductBodyDto) {
    return this.updateProductOrThrow(productId, {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      categoryId: dto.categoryId,
    });
  }

  async removeProduct(productId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: {
            id: productId,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            sortOrder: 9999,
          },
        });

        await tx.cartItem.deleteMany({
          where: {
            productId,
          },
        });
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminProducts.PRODUCT_NOT_FOUND,
          "Produto não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }

  async activateProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { category: { select: { isActive: true } } },
    });

    if (!product) {
      throw new AppException(
        AppException.errorCodes.adminProducts.PRODUCT_NOT_FOUND,
        "Produto não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (!product.category.isActive) {
      throw new AppException(
        AppException.errorCodes.adminProducts.CATEGORY_INACTIVE,
        "Não é possível ativar um produto com categoria inativa.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    return this.updateProductOrThrow(productId, { isActive: true });
  }

  async deactivateProduct(productId: string) {
    return this.updateProductOrThrow(productId, { isActive: false });
  }

  async incrementStock(productId: string, amount: number) {
    return this.updateProductOrThrow(productId, {
      stock: {
        increment: amount,
      },
    });
  }

  async decrementStock(productId: string, amount: number) {
    try {
      // Decrementa de forma atômica somente se o produto existir e houver
      // estoque suficiente, evitando uma busca prévia e estoque negativo.
      return await this.prisma.product.update({
        where: {
          id: productId,
          deletedAt: null,
          stock: {
            gte: amount,
          },
        },
        data: {
          stock: {
            decrement: amount,
          },
        },
        include: {
          category: true,
        },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        // Nenhuma linha casou: ou o produto não existe, ou o estoque é
        // insuficiente. A busca pontual distingue os dois casos.
        await this.findById(productId);

        throw new AppException(
          AppException.errorCodes.adminProducts.INSUFFICIENT_STOCK,
          "Estoque insuficiente para realizar a operação.",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      throw error;
    }
  }

  private async updateProductOrThrow(
    productId: string,
    data: Prisma.ProductUncheckedUpdateInput,
  ) {
    try {
      return await this.prisma.product.update({
        where: {
          id: productId,
          deletedAt: null,
        },
        data,
        include: {
          category: true,
        },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminProducts.PRODUCT_NOT_FOUND,
          "Produto não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }

  private isRecordNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    );
  }
}
