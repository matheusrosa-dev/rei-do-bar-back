import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CreateCategoryDto,
  FindAllCategory,
  UpdateCategoryBodyDto,
} from "./dtos";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllCategory) {
    const categories = await this.prisma.category.findMany({
      where: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
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

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          pluralName: dto.pluralName,
          isActive: false,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
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
      if (this.isRecordNotFound(error)) {
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
      if (this.isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategories.CATEGORY_NOT_FOUND,
          "Categoria não encontrada.",
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

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
