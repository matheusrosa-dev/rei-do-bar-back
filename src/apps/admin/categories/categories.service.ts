import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CreateCategoryDto,
  FindAllCategory,
  UpdateCategoriesOrderDto,
  UpdateCategoryBodyDto,
} from "./dtos";
import {
  isRecordNotFound,
  isUniqueConstraintViolation,
} from "@shared/helpers/prisma-errors";

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllCategory) {
    const categories = await this.prisma.category.findMany({
      where: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
          },
        },
      },
    });

    return categories.map((item) => {
      const { _count, ...rest } = item;

      return {
        ...rest,
        productsCount: _count.products,
      };
    });
  }

  async findAllToSort() {
    const categories = await this.prisma.category.findMany({
      orderBy: {
        sortOrder: "asc",
      },
    });

    return categories;
  }

  async updateCategoriesOrder(dto: UpdateCategoriesOrderDto) {
    const existingCategories = await this.prisma.category.findMany({
      select: { id: true },
    });

    const existingIds = new Set(existingCategories.map((p) => p.id));
    const isValid =
      dto.orderedIds.length === existingIds.size &&
      new Set(dto.orderedIds).size === dto.orderedIds.length &&
      dto.orderedIds.every((id) => existingIds.has(id));

    if (!isValid) {
      throw new AppException(
        AppException.errorCodes.adminCategories.INVALID_CATEGORIES_ORDER,
        "Lista de categorias inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.category.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return this.findAllToSort();
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      const last = await this.prisma.category.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      return await this.prisma.category.create({
        data: {
          name: dto.name,
          pluralName: dto.pluralName,
          isActive: false,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          imageUrl: dto.imageUrl,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategories.CATEGORY_ALREADY_EXISTS,
          "Já existe uma categoria com esse nome.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryBodyDto) {
    const category = await this.updateCategoryOrThrow(categoryId, {
      name: dto.name,
      pluralName: dto.pluralName,
      imageUrl: dto.imageUrl,
    });

    return category;
  }

  async activateCategory(categoryId: string) {
    return this.updateCategoryOrThrow(categoryId, { isActive: true });
  }

  async deactivateCategory(categoryId: string) {
    const category = await this.updateCategoryOrThrow(categoryId, {
      isActive: false,
      products: {
        updateMany: {
          where: {
            isActive: true,
          },
          data: {
            isActive: false,
          },
        },
      },
    });

    return category;
  }

  async removeCategory(categoryId: string) {
    const hasProducts = await this.prisma.product.findFirst({
      where: { categoryId },
      select: { id: true },
    });

    if (hasProducts) {
      throw new AppException(
        AppException.errorCodes.adminCategories.CATEGORY_HAS_PRODUCTS,
        "Não é possível excluir uma categoria com produtos vinculados.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    try {
      await this.prisma.category.delete({ where: { id: categoryId } });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategories.CATEGORY_NOT_FOUND,
          "Categoria não encontrada.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }

  private async updateCategoryOrThrow(
    categoryId: string,
    data: Prisma.CategoryUpdateInput,
  ) {
    try {
      return await this.prisma.category.update({
        where: { id: categoryId },
        data,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategories.CATEGORY_NOT_FOUND,
          "Categoria não encontrada.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategories.CATEGORY_ALREADY_EXISTS,
          "Já existe uma categoria com esse nome.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }
}
