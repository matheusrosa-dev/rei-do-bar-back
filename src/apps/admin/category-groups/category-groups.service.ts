import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CreateCategoryGroupDto,
  UpdateCategoryGroupBodyDto,
  UpdateCategoryGroupsOrderDto,
} from "./dtos";
import {
  isForeignKeyConstraintViolation,
  isRecordNotFound,
  isUniqueConstraintViolation,
} from "@shared/helpers/prisma-errors";
import { isExactPermutation } from "@shared/helpers/permutation";

@Injectable()
export class AdminCategoryGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const categoryGroups = await this.prisma.categoryGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        categories: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            _count: {
              select: {
                products: { where: { isActive: true, deletedAt: null } },
              },
            },
          },
        },
      },
    });

    return categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        const { _count, ...rest } = category;

        return {
          ...rest,
          productsCount: _count.products,
        };
      }),
    }));
  }

  async findOne(categoryGroupId: string) {
    const categoryGroup = await this.prisma.categoryGroup.findUnique({
      where: { id: categoryGroupId },
      include: {
        categories: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!categoryGroup) {
      throw new AppException(
        AppException.errorCodes.adminCategoryGroups.CATEGORY_GROUP_NOT_FOUND,
        "Grupo de categorias não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return categoryGroup;
  }

  async updateCategoryGroupsOrder(dto: UpdateCategoryGroupsOrderDto) {
    const existingCategoryGroups = await this.prisma.categoryGroup.findMany({
      select: { id: true },
    });
    const existingCategories = await this.prisma.category.findMany({
      select: { id: true, categoryGroupId: true },
    });

    const submittedGroupIds = dto.categoryGroups.map(
      (group) => group.categoryGroupId,
    );
    const existingGroupIds = new Set(
      existingCategoryGroups.map((categoryGroup) => categoryGroup.id),
    );

    if (!isExactPermutation(submittedGroupIds, existingGroupIds)) {
      throw new AppException(
        AppException.errorCodes.adminCategoryGroups
          .INVALID_CATEGORY_GROUPS_ORDER,
        "Lista de grupos de categorias inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const existingCategoryIdsByGroup = new Map<string, Set<string>>();

    for (const category of existingCategories) {
      const groupCategoryIds =
        existingCategoryIdsByGroup.get(category.categoryGroupId) ??
        new Set<string>();

      groupCategoryIds.add(category.id);
      existingCategoryIdsByGroup.set(
        category.categoryGroupId,
        groupCategoryIds,
      );
    }

    const hasInvalidCategoriesOrder = dto.categoryGroups.some((group) => {
      const submittedCategoryIds = group.categories.map(
        (category) => category.categoryId,
      );
      const groupCategoryIds =
        existingCategoryIdsByGroup.get(group.categoryGroupId) ??
        new Set<string>();

      return !isExactPermutation(submittedCategoryIds, groupCategoryIds);
    });

    if (hasInvalidCategoriesOrder) {
      throw new AppException(
        AppException.errorCodes.adminCategoryGroups.INVALID_CATEGORIES_ORDER,
        "Lista de categorias inválida.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction([
      ...dto.categoryGroups.map((group, index) =>
        this.prisma.categoryGroup.update({
          where: { id: group.categoryGroupId },
          data: { sortOrder: index + 1 },
        }),
      ),
      ...dto.categoryGroups.flatMap((group) =>
        group.categories.map((category, index) =>
          this.prisma.category.update({
            where: { id: category.categoryId },
            data: { sortOrder: index + 1 },
          }),
        ),
      ),
    ]);

    return this.findAll();
  }

  async createCategoryGroup(dto: CreateCategoryGroupDto) {
    try {
      const last = await this.prisma.categoryGroup.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      return await this.prisma.categoryGroup.create({
        data: {
          name: dto.name,
          allProductsImageUrl: dto.allProductsImageUrl,
          promotionsImageUrl: dto.promotionsImageUrl,
          isActive: false,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategoryGroups
            .CATEGORY_GROUP_ALREADY_EXISTS,
          "Já existe um grupo de categorias com esse nome.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async updateCategoryGroup(
    categoryGroupId: string,
    dto: UpdateCategoryGroupBodyDto,
  ) {
    return this.updateCategoryGroupOrThrow(categoryGroupId, {
      name: dto.name,
      allProductsImageUrl: dto.allProductsImageUrl,
      promotionsImageUrl: dto.promotionsImageUrl,
    });
  }

  async activateCategoryGroup(categoryGroupId: string) {
    return this.updateCategoryGroupOrThrow(categoryGroupId, { isActive: true });
  }

  async deactivateCategoryGroup(categoryGroupId: string) {
    return this.updateCategoryGroupOrThrow(categoryGroupId, {
      isActive: false,
    });
  }

  async removeCategoryGroup(categoryGroupId: string) {
    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: categoryGroupId },
      select: { id: true },
    });

    if (!group) {
      throw new AppException(
        AppException.errorCodes.adminCategoryGroups.CATEGORY_GROUP_NOT_FOUND,
        "Grupo de categorias não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    const categoriesCount = await this.prisma.category.count({
      where: { categoryGroupId },
    });

    if (categoriesCount > 0) {
      throw new AppException(
        AppException.errorCodes.adminCategoryGroups
          .CATEGORY_GROUP_HAS_CATEGORIES,
        "Não é possível excluir um grupo com categorias vinculadas.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    try {
      await this.prisma.categoryGroup.delete({
        where: { id: categoryGroupId },
      });
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategoryGroups
            .CATEGORY_GROUP_HAS_CATEGORIES,
          "Não é possível excluir um grupo com categorias vinculadas.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  private async updateCategoryGroupOrThrow(
    categoryGroupId: string,
    data: Prisma.CategoryGroupUpdateInput,
  ) {
    try {
      return await this.prisma.categoryGroup.update({
        where: { id: categoryGroupId },
        data,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategoryGroups.CATEGORY_GROUP_NOT_FOUND,
          "Grupo de categorias não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCategoryGroups
            .CATEGORY_GROUP_ALREADY_EXISTS,
          "Já existe um grupo de categorias com esse nome.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }
}
