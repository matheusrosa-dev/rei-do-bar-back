import {
  InventoryMovementOrigin,
  PrismaClient,
} from "../../src/shared/database/prisma/generated/client";
import {
  chance,
  chunk,
  dateBetween,
  daysAgo,
  id,
  pickDistinct,
} from "./helpers";

const HISTORY_DAYS = 90;
const RESTOCK_EVENTS_COUNT = 8;
const REMOVAL_EVENTS_COUNT = 3;
const RESTOCK_COST_RATE = 0.6;
const BATCH_SIZE = 500;

type SeedMovement = {
  id: string;
  origin: InventoryMovementOrigin;
  orderId: string | null;
  createdAt: Date;
};

type SeedMovementProduct = {
  inventoryMovementId: string;
  productId: string;
  quantity: number;
  price: number;
};

export async function seedInventory(prisma: PrismaClient) {
  console.log("Seeding inventory movements...");

  const now = new Date();

  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
        shippedAt: true,
        cancelledAt: true,
        items: { select: { productId: true, price: true, quantity: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.product.findMany({
      select: { id: true, price: true, stockQuantity: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const movements: SeedMovement[] = [];
  const movementProducts: SeedMovementProduct[] = [];

  const soldByProduct = new Map<string, number>();
  const returnedByProduct = new Map<string, number>();

  for (const order of orders) {
    const creationId = id();

    movements.push({
      id: creationId,
      origin: InventoryMovementOrigin.ORDER_CREATION,
      orderId: order.id,
      createdAt: order.createdAt,
    });

    for (const item of order.items) {
      movementProducts.push({
        inventoryMovementId: creationId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      });

      soldByProduct.set(
        item.productId,
        (soldByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    if (order.status !== "CANCELLED" || !order.cancelledAt) {
      continue;
    }

    const cancellationId = id();

    // Só o admin cancela um pedido já enviado; antes disso o cancelamento é do cliente
    movements.push({
      id: cancellationId,
      origin: order.shippedAt
        ? InventoryMovementOrigin.ADMIN_ORDER_CANCELLATION
        : InventoryMovementOrigin.ORDER_CANCELLATION,
      orderId: order.id,
      createdAt: order.cancelledAt,
    });

    for (const item of order.items) {
      movementProducts.push({
        inventoryMovementId: cancellationId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      });

      returnedByProduct.set(
        item.productId,
        (returnedByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
  }

  const historyStart = daysAgo(HISTORY_DAYS, now);

  const restockEvents = Array.from({ length: RESTOCK_EVENTS_COUNT }, () => ({
    id: id(),
    createdAt: dateBetween(historyStart, now),
  }));

  const removalEvents = Array.from({ length: REMOVAL_EVENTS_COUNT }, () => ({
    id: id(),
    createdAt: dateBetween(historyStart, now),
  }));

  const usedRestockEvents = new Set<string>();
  const usedRemovalEvents = new Set<string>();
  const finalStockByProduct = new Map<string, number>();

  for (const product of products) {
    const sold = soldByProduct.get(product.id) ?? 0;
    const returned = returnedByProduct.get(product.id) ?? 0;
    const netSold = sold - returned;

    const isOutOfStock = product.stockQuantity === 0;

    const targetStock = isOutOfStock ? 0 : chance.integer({ min: 4, max: 90 });

    let removed =
      !isOutOfStock && chance.bool({ likelihood: 25 })
        ? chance.integer({ min: 1, max: 4 })
        : 0;

    const restocked = Math.max(
      0,
      targetStock + netSold + removed - product.stockQuantity,
    );

    if (restocked === 0) {
      removed = Math.min(removed, product.stockQuantity - netSold);
    }

    finalStockByProduct.set(
      product.id,
      product.stockQuantity + restocked - netSold - removed,
    );

    if (restocked > 0) {
      const events = pickDistinct(
        restockEvents,
        chance.integer({ min: 1, max: 3 }),
      );

      const perEvent = Math.ceil(restocked / events.length);
      let remaining = restocked;

      for (const event of events) {
        const quantity = Math.min(perEvent, remaining);

        remaining -= quantity;

        if (quantity <= 0) {
          continue;
        }

        usedRestockEvents.add(event.id);

        movementProducts.push({
          inventoryMovementId: event.id,
          productId: product.id,
          quantity,
          price: Math.round(product.price * RESTOCK_COST_RATE),
        });
      }
    }

    if (removed > 0) {
      const event = chance.pickone(removalEvents);

      usedRemovalEvents.add(event.id);

      movementProducts.push({
        inventoryMovementId: event.id,
        productId: product.id,
        quantity: removed,
        price: product.price,
      });
    }
  }

  for (const event of restockEvents) {
    if (!usedRestockEvents.has(event.id)) {
      continue;
    }

    movements.push({
      id: event.id,
      origin: InventoryMovementOrigin.ADMIN_RESTOCK,
      orderId: null,
      createdAt: event.createdAt,
    });
  }

  for (const event of removalEvents) {
    if (!usedRemovalEvents.has(event.id)) {
      continue;
    }

    movements.push({
      id: event.id,
      origin: InventoryMovementOrigin.ADMIN_REMOVAL,
      orderId: null,
      createdAt: event.createdAt,
    });
  }

  for (const batch of chunk(movements, BATCH_SIZE)) {
    await prisma.inventoryMovement.createMany({ data: batch });
  }

  for (const batch of chunk(movementProducts, BATCH_SIZE * 2)) {
    await prisma.inventoryMovementProduct.createMany({ data: batch });
  }

  for (const [productId, stockQuantity] of finalStockByProduct) {
    await prisma.product.update({
      where: { id: productId },
      data: { stockQuantity },
    });
  }

  console.log(
    `${movements.length} inventory movements seeded (${movementProducts.length} product rows, ${finalStockByProduct.size} stock quantities reconciled).`,
  );
}
