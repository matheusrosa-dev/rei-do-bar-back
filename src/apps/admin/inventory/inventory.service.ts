import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { InventoryMovementOrigin } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import {
  DecrementInventoryDto,
  FindAllMovementsDto,
  IncrementInventoryDto,
  UpdateMovementBodyDto,
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

    const where: Prisma.InventoryMovementWhereInput = {};

    if (dto.origin?.length) {
      where.origin = { in: dto.origin };
    }

    if (dto.productIds?.length) {
      where.products = { some: { productId: { in: dto.productIds } } };
    }

    const [items, total, lastDisqualifyingMovement] =
      await this.prisma.$transaction([
        this.prisma.inventoryMovement.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            order: true,
            products: {
              include: {
                product: true,
              },
            },
          },
        }),
        this.prisma.inventoryMovement.count({ where }),
        this.prisma.inventoryMovement.findFirst({
          where: {
            origin: {
              in: [
                InventoryMovementOrigin.ORDER_CREATION,
                InventoryMovementOrigin.ADMIN_REMOVAL,
              ],
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { createdAt: true },
        }),
      ]);

    return {
      items: items.map((item) => ({
        ...item,
        editable:
          item.origin === InventoryMovementOrigin.ADMIN_REMOVAL ||
          (item.origin === InventoryMovementOrigin.ADMIN_RESTOCK &&
            this.isRestockStillEditable(item, lastDisqualifyingMovement)),
      })),
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
        movementProducts: movementProducts.map((movementProduct) => ({
          ...movementProduct,
          price: Math.round(
            movementProduct.totalCost / movementProduct.quantity,
          ),
        })),
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

  async updateRestockMovement(
    movementId: string,
    { movementProducts }: UpdateMovementBodyDto,
  ) {
    const productIds = movementProducts.map((product) => product.productId);

    this.assertUniqueMovementProducts(productIds);

    await this.prisma.$transaction(async (tx) => {
      const movement = await this.loadMovementForWrite(tx, movementId, [
        InventoryMovementOrigin.ADMIN_RESTOCK,
      ]);

      const quantityDeltaByProductId = new Map<string, number>();

      for (const previousProduct of movement.products) {
        quantityDeltaByProductId.set(
          previousProduct.productId,
          -previousProduct.quantity,
        );
      }

      for (const movementProduct of movementProducts) {
        const previousDelta =
          quantityDeltaByProductId.get(movementProduct.productId) ?? 0;

        quantityDeltaByProductId.set(
          movementProduct.productId,
          previousDelta + movementProduct.quantity,
        );
      }

      const sortedDeltas = [...quantityDeltaByProductId].sort(
        ([firstProductId], [secondProductId]) =>
          firstProductId.localeCompare(secondProductId),
      );

      for (const [productId, delta] of sortedDeltas) {
        await this.applyStockDelta(tx, productId, delta);
      }

      await tx.inventoryMovementProduct.deleteMany({
        where: { inventoryMovementId: movementId },
      });

      await tx.inventoryMovementProduct.createMany({
        data: movementProducts.map((movementProduct) => ({
          inventoryMovementId: movementId,
          productId: movementProduct.productId,
          quantity: movementProduct.quantity,
          price: Math.round(
            movementProduct.totalCost / movementProduct.quantity,
          ),
        })),
      });
    });
  }

  async revertMovement(movementId: string) {
    await this.prisma.$transaction(async (tx) => {
      const movement = await this.loadMovementForWrite(tx, movementId, [
        InventoryMovementOrigin.ADMIN_RESTOCK,
        InventoryMovementOrigin.ADMIN_REMOVAL,
      ]);

      const direction =
        movement.origin === InventoryMovementOrigin.ADMIN_RESTOCK ? -1 : 1;

      for (const movementProduct of movement.products) {
        await this.applyStockDelta(
          tx,
          movementProduct.productId,
          direction * movementProduct.quantity,
        );
      }

      await tx.inventoryMovement.delete({ where: { id: movementId } });
    });
  }

  private isRestockStillEditable(
    movement: { createdAt: Date },
    lastDisqualifyingMovement: { createdAt: Date } | null,
  ): boolean {
    if (!lastDisqualifyingMovement) return true;

    return (
      movement.createdAt.getTime() >
      lastDisqualifyingMovement.createdAt.getTime()
    );
  }

  private async loadMovementForWrite(
    tx: Prisma.TransactionClient,
    movementId: string,
    allowedOrigins: InventoryMovementOrigin[],
  ) {
    // Bloqueia a linha da movimentação para serializar edições e reversões
    // concorrentes: a alteração de estoque é derivada das linhas lidas aqui, e
    // duas escritas simultâneas aplicariam o mesmo efeito duas vezes.
    await tx.$queryRaw`SELECT id FROM inventories WHERE id = ${movementId} FOR UPDATE`;

    const movement = await tx.inventoryMovement.findUnique({
      where: { id: movementId },
      // A ordem fixa por produto mantém determinística a ordem em que as linhas
      // de `product` são travadas, evitando deadlock entre escritas concorrentes
      // que tocam os mesmos produtos.
      include: { products: { orderBy: { productId: "asc" } } },
    });

    if (!movement) {
      throw new AppException(
        AppException.errorCodes.adminInventory.MOVEMENT_NOT_FOUND,
        "Movimentação de estoque não encontrada.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (!allowedOrigins.includes(movement.origin)) {
      throw this.buildMovementNotEditableError();
    }

    // Só a reposição tem janela: devolver o estoque de uma remoção nunca
    // esbarra no saldo, então uma remoção continua reversível indefinidamente.
    if (movement.origin === InventoryMovementOrigin.ADMIN_RESTOCK) {
      const lastDisqualifyingMovement = await tx.inventoryMovement.findFirst({
        where: {
          origin: {
            in: [
              InventoryMovementOrigin.ORDER_CREATION,
              InventoryMovementOrigin.ADMIN_REMOVAL,
            ],
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      });

      if (!this.isRestockStillEditable(movement, lastDisqualifyingMovement)) {
        throw this.buildMovementNotEditableError();
      }
    }

    return movement;
  }

  private async applyStockDelta(
    tx: Prisma.TransactionClient,
    productId: string,
    delta: number,
  ) {
    if (delta === 0) return;

    const where: Prisma.ProductWhereInput = {
      id: productId,
      deletedAt: null,
    };

    if (delta < 0) {
      where.stockQuantity = { gte: -delta };
    }

    const { count } = await tx.product.updateMany({
      where,
      data: {
        stockQuantity: { increment: delta },
      },
    });

    if (count === 0) {
      throw await this.buildStockMutationError(
        tx,
        productId,
        "Estoque insuficiente para ajustar esta reposição.",
      );
    }
  }

  private buildMovementNotEditableError() {
    return new AppException(
      AppException.errorCodes.adminInventory.MOVEMENT_NOT_EDITABLE,
      "Esta movimentação de estoque não pode ser alterada.",
      AppException.HttpStatus.BAD_REQUEST,
    );
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
    insufficientStockMessage = "Estoque insuficiente para realizar a remoção.",
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
      insufficientStockMessage,
      AppException.HttpStatus.BAD_REQUEST,
    );
  }
}
