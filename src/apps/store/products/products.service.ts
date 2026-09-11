import { Injectable } from "@nestjs/common";

import { PrismaService } from "@shared/database/prisma/prisma.service";
import type { ICurrentSession } from "@shared/types/jwt";
import type { SearchProductsDto } from "./dtos";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findCatalog(session: ICurrentSession) {
    const [categoryGroups, customerOrAnonymous] = await Promise.all([
      this.prisma.categoryGroup.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          allProductsImageUrl: true,
          promotionsImageUrl: true,
          categories: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              pluralName: true,
              imageUrl: true,
              products: {
                where: { isActive: true, deletedAt: null },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  name: true,
                  description: true,
                  compareAtPrice: true,
                  price: true,
                  imageUrl: true,
                  stockQuantity: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      }),
      this.findAnonymousOrCustomerWithCart(session),
    ]);

    const quantityInCart = this.calculateQuantityInCart(
      customerOrAnonymous?.cart?.items ?? [],
    );

    return categoryGroups
      .map((categoryGroup) => {
        const categories = categoryGroup.categories.map((category) => ({
          ...category,
          products: category.products.map((product) =>
            this.enrichProduct(product, quantityInCart),
          ),
        }));

        const nonEmptyCategories = categories.filter(
          (category) => category.products.length > 0,
        );

        const hasSingleCategory = nonEmptyCategories.length === 1;
        const pseudoCategories = this.buildPseudoCategories(
          nonEmptyCategories,
          !hasSingleCategory,
          categoryGroup,
        );

        return {
          ...categoryGroup,
          categories: [
            ...pseudoCategories,
            ...(hasSingleCategory ? [] : nonEmptyCategories),
          ],
        };
      })
      .filter((categoryGroup) => categoryGroup.categories.length > 0);
  }

  async search(session: ICurrentSession, dto: SearchProductsDto) {
    const term = { contains: dto.searchTerm, mode: "insensitive" } as const;

    const [products, customerOrAnonymous] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          category: { isActive: true, categoryGroup: { isActive: true } },
          OR: [
            { name: term },
            { description: term },
            { category: { name: term } },
            { category: { pluralName: term } },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          compareAtPrice: true,
          price: true,
          imageUrl: true,
          stockQuantity: true,
        },
      }),
      this.findAnonymousOrCustomerWithCart(session),
    ]);

    const quantityInCart = this.calculateQuantityInCart(
      customerOrAnonymous?.cart?.items ?? [],
    );

    return products.map((product) =>
      this.enrichProduct(product, quantityInCart),
    );
  }

  private buildPseudoCategories(
    categories: {
      products: {
        id: string;
        sortOrder: number;
        compareAtPrice: number | null;
      }[];
    }[],
    includePromotions: boolean,
    images: { allProductsImageUrl: string; promotionsImageUrl: string },
  ) {
    const products = categories
      .flatMap((category) => category.products)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    if (products.length === 0) {
      return [];
    }

    const promotions = products.filter(
      (product) => product.compareAtPrice !== null,
    );

    const allProductsCategory = {
      id: "Todos",
      name: "Todos",
      pluralName: "Todos",
      imageUrl: images.allProductsImageUrl,
      products,
    };

    if (!includePromotions || promotions.length === 0) {
      return [allProductsCategory];
    }

    return [
      allProductsCategory,
      {
        id: "Promoções",
        name: "Promoções",
        pluralName: "Promoções",
        imageUrl: images.promotionsImageUrl,
        products: promotions,
      },
    ];
  }

  private findAnonymousOrCustomerWithCart(session: ICurrentSession) {
    const select = {
      cart: {
        select: {
          items: {
            select: { productId: true, quantity: true },
          },
        },
      },
    };

    if (session?.customerId) {
      return this.prisma.customer.findFirst({
        where: { id: session.customerId },
        select,
      });
    }

    return this.prisma.anonymousCustomer.findUnique({
      where: { deviceId: session.deviceId },
      select,
    });
  }

  private enrichProduct<T extends { id: string; stockQuantity: number }>(
    product: T,
    quantityInCart: Record<string, number>,
  ) {
    return {
      ...product,
      quantityInCart: quantityInCart[product.id] || 0,
      remainingStock:
        product.stockQuantity <= 10 ? product.stockQuantity : null,
    };
  }

  private calculateQuantityInCart(
    items: { productId: string; quantity: number }[],
  ) {
    return items.reduce(
      (acc, item) => {
        const key = item.productId;
        acc[key] = (acc[key] || 0) + item.quantity;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
