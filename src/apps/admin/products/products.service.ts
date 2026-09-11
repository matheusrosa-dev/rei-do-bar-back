import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import {
  CreateProductDto,
  UpdateProductBodyDto,
  UpdateProductsOrderDto,
} from "./dtos";
import { isRecordNotFound } from "@shared/helpers/prisma-errors";
import { isExactPermutation } from "@shared/helpers/permutation";

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const [categoryGroups, products] = await this.prisma.$transaction([
      this.prisma.categoryGroup.findMany({
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          category: true,
        },
      }),
    ]);

    return categoryGroups.map((group) => ({
      ...group,
      products: products.filter(
        (product) => product.category.categoryGroupId === group.id,
      ),
    }));
  }

  async findAllSimple() {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return products;
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
    const categoryGroupId = await this.findCategoryGroupIdOrThrow(
      dto.categoryId,
    );

    try {
      const last = await this.prisma.product.findFirst({
        where: {
          deletedAt: null,
          category: { categoryGroupId },
        },
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
          compareAtPrice: dto.compareAtPrice || null,
          stockQuantity: 0,
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
      if (isRecordNotFound(error)) {
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
    const sortOrder = await this.findSortOrderOnCategoryChange(
      productId,
      dto.categoryId,
    );

    return this.updateProductOrThrow(productId, {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      categoryId: dto.categoryId,
      compareAtPrice: dto.compareAtPrice || null,
      ...(sortOrder !== null && { sortOrder }),
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
            sortOrder: -1,
          },
        });

        await tx.cartItem.deleteMany({
          where: {
            productId,
          },
        });
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
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

  async updateProductsOrder(dto: UpdateProductsOrderDto) {
    const existingCategoryGroups = await this.prisma.categoryGroup.findMany({
      select: { id: true },
    });
    const existingProducts = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, category: { select: { categoryGroupId: true } } },
    });

    const submittedGroupIds = dto.categoryGroups.map(
      (group) => group.categoryGroupId,
    );
    const existingGroupIds = new Set(
      existingCategoryGroups.map((categoryGroup) => categoryGroup.id),
    );

    if (!isExactPermutation(submittedGroupIds, existingGroupIds)) {
      throw new AppException(
        AppException.errorCodes.adminProducts.INVALID_CATEGORY_GROUPS_ORDER,
        "Lista de grupos de categorias inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const existingProductIdsByGroup = new Map<string, Set<string>>();

    for (const product of existingProducts) {
      const groupProductIds =
        existingProductIdsByGroup.get(product.category.categoryGroupId) ??
        new Set<string>();

      groupProductIds.add(product.id);
      existingProductIdsByGroup.set(
        product.category.categoryGroupId,
        groupProductIds,
      );
    }

    const hasInvalidProductsOrder = dto.categoryGroups.some((group) => {
      const submittedProductIds = group.products.map(
        (product) => product.productId,
      );
      const groupProductIds =
        existingProductIdsByGroup.get(group.categoryGroupId) ??
        new Set<string>();

      return !isExactPermutation(submittedProductIds, groupProductIds);
    });

    if (hasInvalidProductsOrder) {
      throw new AppException(
        AppException.errorCodes.adminProducts.INVALID_PRODUCTS_ORDER,
        "Lista de produtos inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(
      dto.categoryGroups.flatMap((group) =>
        group.products.map((product, index) =>
          this.prisma.product.update({
            where: { id: product.productId },
            data: { sortOrder: index + 1 },
          }),
        ),
      ),
    );

    return this.findAll();
  }

  private async findSortOrderOnCategoryChange(
    productId: string,
    categoryId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { categoryId: true },
    });

    if (!product || product.categoryId === categoryId) {
      return null;
    }

    const categoryGroupId = await this.findCategoryGroupIdOrThrow(categoryId);

    const last = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        id: { not: productId },
        category: { categoryGroupId },
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + 1;
  }

  private async findCategoryGroupIdOrThrow(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { categoryGroupId: true },
    });

    if (!category) {
      throw new AppException(
        AppException.errorCodes.adminProducts.INVALID_CATEGORY,
        "Categoria inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    return category.categoryGroupId;
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
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminProducts.PRODUCT_NOT_FOUND,
          "Produto não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }
}
