import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import {
  CreateProductDto,
  FindAllProductsDto,
  UpdateProductBodyDto,
} from "./dtos";

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
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
    }

    return product;
  }

  async createProduct(dto: CreateProductDto) {
    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          imageUrl: dto.imageUrl,
          isActive: false,
          stock: 0,
          category: {
            connect: {
              id: dto.categoryId,
            },
          },
        },
      });

      return product;
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new BadRequestException("Categoria inválida");
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
        throw new NotFoundException("Produto não encontrado");
      }

      throw error;
    }
  }

  async activateProduct(productId: string) {
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
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new NotFoundException("Produto não encontrado");
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
