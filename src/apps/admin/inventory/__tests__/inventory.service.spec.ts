import { Test, TestingModule } from "@nestjs/testing";
import { InventoryMovementOrigin } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { AdminInventoryService } from "../inventory.service";

const MOVEMENT_ID = "movement-id";
const PRODUCT_A = "product-a";
const PRODUCT_B = "product-b";
const PRODUCT_C = "product-c";

const at = (isoTime: string) => new Date(`2026-08-27T${isoTime}.000Z`);

const restockMovement = (overrides?: Partial<Record<string, unknown>>) => ({
  id: MOVEMENT_ID,
  origin: InventoryMovementOrigin.ADMIN_RESTOCK,
  createdAt: at("10:00:00"),
  products: [{ productId: PRODUCT_A, quantity: 5, price: 1000 }],
  ...overrides,
});

describe("AdminInventoryService", () => {
  let service: AdminInventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInventoryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminInventoryService>(AdminInventoryService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("listMovements", () => {
    const mockListing = (
      items: ReturnType<typeof restockMovement>[],
      lastDisqualifyingMovement: { createdAt: Date } | null,
    ) => {
      prismaMock.inventoryMovement.findMany.mockResolvedValueOnce(items);
      prismaMock.inventoryMovement.count.mockResolvedValueOnce(items.length);
      prismaMock.inventoryMovement.findFirst.mockResolvedValueOnce(
        lastDisqualifyingMovement,
      );
    };

    it("should mark a restock editable when no order or removal happened after it", async () => {
      mockListing([restockMovement()], null);

      const { items } = await service.listMovements({});

      expect(items[0]).toEqual(expect.objectContaining({ editable: true }));
    });

    it("should mark a restock not editable once an order or removal lands after it", async () => {
      mockListing([restockMovement({ createdAt: at("10:00:00") })], {
        createdAt: at("10:00:01"),
      });

      const { items } = await service.listMovements({});

      expect(items[0]).toEqual(expect.objectContaining({ editable: false }));
    });

    it("should conservatively report not editable when the restock shares the same millisecond as the disqualifying movement", async () => {
      const sameInstant = at("10:00:00");

      mockListing([restockMovement({ createdAt: sameInstant })], {
        createdAt: sameInstant,
      });

      const { items } = await service.listMovements({});

      // A comparação é estritamente "depois de" — timestamps iguais não
      // provam que a reposição veio antes, então o item some do editável.
      expect(items[0]).toEqual(expect.objectContaining({ editable: false }));
    });

    it("should never mark a non-restock origin editable, even with no disqualifying movement", async () => {
      mockListing(
        [
          restockMovement({
            origin: InventoryMovementOrigin.ADMIN_REMOVAL,
          }),
        ],
        null,
      );

      const { items } = await service.listMovements({});

      expect(items[0]).toEqual(expect.objectContaining({ editable: false }));
    });
  });

  describe("updateRestockMovement", () => {
    const payload = {
      movementProducts: [
        { productId: PRODUCT_A, quantity: 8, totalCost: 800 },
        { productId: PRODUCT_C, quantity: 2, totalCost: 240 },
      ],
    };

    beforeEach(() => {
      prismaMock.$queryRaw.mockResolvedValue(undefined);
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          products: [
            { productId: PRODUCT_A, quantity: 5, price: 1000 },
            { productId: PRODUCT_B, quantity: 3, price: 900 },
          ],
        }),
      );
      prismaMock.inventoryMovement.findFirst.mockResolvedValue(null);
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    });

    it("should reconcile stock by a signed per-product delta, dropping lines absent from the new payload", async () => {
      await service.updateRestockMovement(MOVEMENT_ID, payload);

      // product-a: 5 -> 8 (+3); product-b: 3 -> 0, removida da reposição (-3);
      // product-c: entra do zero (+2). A ordem por id evita deadlock entre
      // escritas concorrentes.
      const calls = prismaMock.product.updateMany.mock.calls;

      expect(calls).toEqual([
        [
          expect.objectContaining({
            where: expect.objectContaining({ id: PRODUCT_A }),
            data: { stockQuantity: { increment: 3 } },
          }),
        ],
        [
          expect.objectContaining({
            where: expect.objectContaining({
              id: PRODUCT_B,
              stockQuantity: { gte: 3 },
            }),
            data: { stockQuantity: { increment: -3 } },
          }),
        ],
        [
          expect.objectContaining({
            where: expect.objectContaining({ id: PRODUCT_C }),
            data: { stockQuantity: { increment: 2 } },
          }),
        ],
      ]);
    });

    it("should not touch stock for a product whose quantity did not change", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          products: [{ productId: PRODUCT_A, quantity: 8, price: 1000 }],
        }),
      );

      await service.updateRestockMovement(MOVEMENT_ID, {
        movementProducts: [
          { productId: PRODUCT_A, quantity: 8, totalCost: 800 },
        ],
      });

      expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    });

    it("should fully replace the movement's lines with the rounded unit cost", async () => {
      await service.updateRestockMovement(MOVEMENT_ID, payload);

      expect(
        prismaMock.inventoryMovementProduct.deleteMany,
      ).toHaveBeenCalledWith({
        where: { inventoryMovementId: MOVEMENT_ID },
      });
      expect(
        prismaMock.inventoryMovementProduct.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            inventoryMovementId: MOVEMENT_ID,
            productId: PRODUCT_A,
            quantity: 8,
            price: 100,
          },
          {
            inventoryMovementId: MOVEMENT_ID,
            productId: PRODUCT_C,
            quantity: 2,
            price: 120,
          },
        ],
      });
    });

    it("should lock the movement row before reading its lines", async () => {
      await service.updateRestockMovement(MOVEMENT_ID, payload);

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.inventoryMovement.findUnique.mock.invocationCallOrder[0],
      );
    });

    it("should reject a batch carrying the same product twice before opening the transaction", async () => {
      await expect(
        service.updateRestockMovement(MOVEMENT_ID, {
          movementProducts: [
            { productId: PRODUCT_A, quantity: 1, totalCost: 100 },
            { productId: PRODUCT_A, quantity: 1, totalCost: 100 },
          ],
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.DUPLICATE_PRODUCT,
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should throw MOVEMENT_NOT_FOUND when the movement does not exist", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRestockMovement(MOVEMENT_ID, payload),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_FOUND,
      });
    });

    it("should throw MOVEMENT_NOT_EDITABLE for a movement that is not an admin restock", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({ origin: InventoryMovementOrigin.ADMIN_REMOVAL }),
      );

      await expect(
        service.updateRestockMovement(MOVEMENT_ID, payload),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_EDITABLE,
      });
    });

    it("should throw MOVEMENT_NOT_EDITABLE once stock has moved since the restock", async () => {
      prismaMock.inventoryMovement.findFirst.mockResolvedValue({
        createdAt: at("10:00:01"),
      });

      await expect(
        service.updateRestockMovement(MOVEMENT_ID, payload),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_EDITABLE,
      });
    });

    it("should map a zero-row stock update to insufficient stock when the product still exists", async () => {
      prismaMock.product.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.product.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.product.findFirst.mockResolvedValue({ id: PRODUCT_B });

      await expect(
        service.updateRestockMovement(MOVEMENT_ID, payload),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.INSUFFICIENT_STOCK,
      });
    });

    it("should map a zero-row stock update to product not found when the product is gone", async () => {
      prismaMock.product.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.product.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRestockMovement(MOVEMENT_ID, payload),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.PRODUCT_NOT_FOUND,
      });
    });
  });

  describe("revertMovement", () => {
    beforeEach(() => {
      prismaMock.$queryRaw.mockResolvedValue(undefined);
      prismaMock.inventoryMovement.findFirst.mockResolvedValue(null);
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    });

    it("should take the full restocked quantity back out of stock and delete the movement", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          products: [
            { productId: PRODUCT_A, quantity: 5, price: 1000 },
            { productId: PRODUCT_B, quantity: 3, price: 900 },
          ],
        }),
      );

      await service.revertMovement(MOVEMENT_ID);

      expect(prismaMock.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: PRODUCT_A,
          deletedAt: null,
          stockQuantity: { gte: 5 },
        },
        data: { stockQuantity: { increment: -5 } },
      });
      expect(prismaMock.product.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: PRODUCT_B,
          deletedAt: null,
          stockQuantity: { gte: 3 },
        },
        data: { stockQuantity: { increment: -3 } },
      });
      expect(prismaMock.inventoryMovement.delete).toHaveBeenCalledWith({
        where: { id: MOVEMENT_ID },
      });
    });

    it("should throw MOVEMENT_NOT_EDITABLE instead of deleting once stock has moved since the restock", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          products: [{ productId: PRODUCT_A, quantity: 5, price: 1000 }],
        }),
      );
      prismaMock.inventoryMovement.findFirst.mockResolvedValue({
        createdAt: at("10:00:01"),
      });

      await expect(service.revertMovement(MOVEMENT_ID)).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_EDITABLE,
      });
      expect(prismaMock.inventoryMovement.delete).not.toHaveBeenCalled();
    });

    it("should return the removed quantity to stock and delete the movement, with no floor guard", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          origin: InventoryMovementOrigin.ADMIN_REMOVAL,
          products: [
            { productId: PRODUCT_A, quantity: 5, price: 1500 },
            { productId: PRODUCT_B, quantity: 3, price: 900 },
          ],
        }),
      );

      await service.revertMovement(MOVEMENT_ID);

      // Delta positivo: sem `stockQuantity: { gte }` no where — devolver
      // estoque nunca esbarra em saldo.
      expect(prismaMock.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: PRODUCT_A, deletedAt: null },
        data: { stockQuantity: { increment: 5 } },
      });
      expect(prismaMock.product.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: PRODUCT_B, deletedAt: null },
        data: { stockQuantity: { increment: 3 } },
      });
      expect(prismaMock.inventoryMovement.delete).toHaveBeenCalledWith({
        where: { id: MOVEMENT_ID },
      });
    });

    it("should revert a removal without checking for a disqualifying movement, unlike a restock", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          origin: InventoryMovementOrigin.ADMIN_REMOVAL,
          products: [{ productId: PRODUCT_A, quantity: 5, price: 1500 }],
        }),
      );
      prismaMock.inventoryMovement.findFirst.mockResolvedValue({
        createdAt: at("10:00:01"),
      });

      await service.revertMovement(MOVEMENT_ID);

      // Remoção não tem janela de elegibilidade: o findFirst do último
      // movimento desqualificante nem chega a ser consultado.
      expect(prismaMock.inventoryMovement.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.delete).toHaveBeenCalledWith({
        where: { id: MOVEMENT_ID },
      });
    });

    it("should throw MOVEMENT_NOT_FOUND when the movement does not exist", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(null);

      await expect(service.revertMovement(MOVEMENT_ID)).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_FOUND,
      });
    });

    it("should throw MOVEMENT_NOT_EDITABLE for an order-driven origin", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({ origin: InventoryMovementOrigin.ORDER_CREATION }),
      );

      await expect(service.revertMovement(MOVEMENT_ID)).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.MOVEMENT_NOT_EDITABLE,
      });
    });

    it("should map a zero-row stock update on a removal revert to product not found, never insufficient stock", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(
        restockMovement({
          origin: InventoryMovementOrigin.ADMIN_REMOVAL,
          products: [{ productId: PRODUCT_A, quantity: 5, price: 1500 }],
        }),
      );
      prismaMock.product.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(service.revertMovement(MOVEMENT_ID)).rejects.toMatchObject({
        code: AppException.errorCodes.adminInventory.PRODUCT_NOT_FOUND,
      });
    });
  });
});
