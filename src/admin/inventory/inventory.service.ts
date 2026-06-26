import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { InventoryMovementOrigin } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import {
  DecrementInventoryDto,
  FindAllMovementsDto,
  IncrementInventoryDto,
} from "./dtos";

type MovementProduct = {
  price: number;
  quantity: number;
  productId: string;
};

@Injectable()
export class AdminInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listMovements(dto: FindAllMovementsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          order: true,
          products: {
            include: {
              product: true,
            },
          },
        },
      }),
      this.prisma.inventoryMovement.count(),
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

  async incrementInventory({ movementProducts }: IncrementInventoryDto) {
    const productIds = movementProducts.map((product) => product.productId);

    this.assertUniqueMovementProducts(productIds);

    await this.prisma.$transaction(async (tx) => {
      for (const movementProduct of movementProducts) {
        const { count } = await tx.product.updateMany({
          where: {
            id: movementProduct.productId,
            deletedAt: null,
          },
          data: {
            stockQuantity: { increment: movementProduct.quantity },
          },
        });

        if (count === 0) {
          throw await this.buildStockMutationError(
            tx,
            movementProduct.productId,
          );
        }
      }

      await this.registerInventoryMovement(tx, {
        origin: InventoryMovementOrigin.ADMIN_RESTOCK,
        movementProducts,
      });
    });
  }

  async decrementInventory({ movementProducts }: DecrementInventoryDto) {
    const productIds = movementProducts.map((product) => product.productId);

    this.assertUniqueMovementProducts(productIds);

    await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: { id: true, price: true },
      });

      const priceByProductId = new Map(
        products.map((product) => [product.id, product.price]),
      );

      for (const movementProduct of movementProducts) {
        const { count } = await tx.product.updateMany({
          where: {
            id: movementProduct.productId,
            deletedAt: null,
            stockQuantity: { gte: movementProduct.quantity },
          },
          data: {
            stockQuantity: { decrement: movementProduct.quantity },
          },
        });

        if (count === 0) {
          throw await this.buildStockMutationError(
            tx,
            movementProduct.productId,
          );
        }
      }

      await this.registerInventoryMovement(tx, {
        origin: InventoryMovementOrigin.ADMIN_REMOVAL,
        movementProducts: movementProducts.map((movementProduct) => ({
          ...movementProduct,
          price: priceByProductId.get(movementProduct.productId)!,
        })),
      });
    });
  }

  private async registerInventoryMovement(
    tx: Prisma.TransactionClient,
    props: {
      origin: InventoryMovementOrigin;
      movementProducts: MovementProduct[];
    },
  ) {
    const { origin, movementProducts } = props;

    await tx.inventoryMovement.create({
      data: {
        origin,
        products: {
          createMany: {
            data: movementProducts.map((movementProduct) => ({
              price: movementProduct.price,
              quantity: movementProduct.quantity,
              productId: movementProduct.productId,
            })),
          },
        },
      },
    });
  }

  private assertUniqueMovementProducts(productIds: string[]) {
    const seenIds = new Set<string>();

    for (const productId of productIds) {
      if (seenIds.has(productId)) {
        throw new AppException(
          AppException.errorCodes.adminInventory.DUPLICATE_PRODUCT,
          "Produto duplicado na movimentação de estoque.",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      seenIds.add(productId);
    }
  }

  private async buildStockMutationError(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<AppException> {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      return new AppException(
        AppException.errorCodes.adminInventory.PRODUCT_NOT_FOUND,
        "Produto não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return new AppException(
      AppException.errorCodes.adminInventory.INSUFFICIENT_STOCK,
      "Estoque insuficiente para realizar a remoção.",
      AppException.HttpStatus.BAD_REQUEST,
    );
  }
}
