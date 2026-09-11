import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import { CreateCategoryDto, UpdateCategoryBodyDto } from "./dtos";
import {
  isRecordNotFound,
  isUniqueConstraintViolation,
} from "@shared/helpers/prisma-errors";

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  async findOne(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        categoryGroup: true,
        _count: {
          select: {
            products: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!category) {
      throw new AppException(
        AppException.errorCodes.adminCategories.CATEGORY_NOT_FOUND,
        "Categoria não encontrada.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    const { _count, ...rest } = category;

    return {
      ...rest,
      productsCount: _count.products,
    };
  }

  async createCategory(dto: CreateCategoryDto) {
    await this.ensureCategoryGroupExists(dto.categoryGroupId);

    try {
      const last = await this.prisma.category.findFirst({
        where: { categoryGroupId: dto.categoryGroupId },
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
          categoryGroup: { connect: { id: dto.categoryGroupId } },
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
    return this.updateCategoryOrThrow(categoryId, {
      name: dto.name,
      pluralName: dto.pluralName,
      imageUrl: dto.imageUrl,
    });
  }

  async activateCategory(categoryId: string) {
    return this.updateCategoryOrThrow(categoryId, { isActive: true });
  }

  async deactivateCategory(categoryId: string) {
    return this.updateCategoryOrThrow(categoryId, { isActive: false });
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

  private async ensureCategoryGroupExists(categoryGroupId: string) {
    const categoryGroup = await this.prisma.categoryGroup.findUnique({
      where: { id: categoryGroupId },
      select: { id: true },
    });

    if (!categoryGroup) {
      throw new AppException(
        AppException.errorCodes.adminCategories.INVALID_CATEGORY_GROUP,
        "Grupo de categorias não encontrado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async updateCategoryOrThrow(
    categoryId: string,
    data: Prisma.CategoryUpdateInput,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    try {
      return await tx.category.update({
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
