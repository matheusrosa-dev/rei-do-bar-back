import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";

const prismaMock = {
  product: {
    findMany: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
  },
};

const makeProduct = (id: string, stock = 100) => ({
  id,
  name: `Product ${id}`,
  description: `Description ${id}`,
  price: 1000,
  imageUrl: `http://img/${id}`,
  stock,
});

describe("ProductsService", () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findBestSellers", () => {
    describe("quantityInCart", () => {
      it("should return products with quantityInCart=1 for products in customer cart", async () => {
        const products = [makeProduct("p1"), makeProduct("p2")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [{ productId: "p1", quantity: 1 }] },
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...products[0],
            quantityInCart: 1,
            remainingStock: null,
          },
          {
            ...products[1],
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });

      it("should return products with quantityInCart=0 when cart is empty", async () => {
        const products = [makeProduct("p1")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...products[0],
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });

      it("should return products with quantityInCart=0 when customer is not found", async () => {
        const products = [makeProduct("p1")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue(null);

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...products[0],
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });
    });

    describe("remainingStock", () => {
      it("should return products without remainingStock when stock is greater than 10", async () => {
        const products = [makeProduct("p1", 11)];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...products[0],
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });

      it("should return products with remainingStock when stock is 10 or less", async () => {
        const products = [makeProduct("p1", 5)];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...products[0],
            quantityInCart: 0,
            remainingStock: 5,
          },
        ]);
      });
    });

    describe("category filtering", () => {
      it("should filter products by category when category is provided", async () => {
        const products = [makeProduct("p1"), makeProduct("p2")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        await service.findBestSellers("device-123", "Bebidas");

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              category: { name: "Bebidas" },
            }),
          }),
        );
      });

      it("should not filter by category when category is not provided", async () => {
        const products = [makeProduct("p1"), makeProduct("p2")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        await service.findBestSellers("device-123");

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              sortOrder: { not: null },
            }),
          }),
        );
      });
    });

    describe("sortOrder filtering", () => {
      it("should filter products with sortOrder not null when category is not provided", async () => {
        const products = [makeProduct("p1"), makeProduct("p2")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        await service.findBestSellers("device-123");

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              sortOrder: { not: null },
            }),
          }),
        );
      });

      it("should not filter products by sortOrder when category is provided", async () => {
        const products = [makeProduct("p1"), makeProduct("p2")];
        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });

        await service.findBestSellers("device-123", "Bebidas");

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.not.objectContaining({
              sortOrder: { not: null },
            }),
          }),
        );
      });
    });

    it("should sort products by sortOrder ascending", async () => {
      const products = [makeProduct("p1"), makeProduct("p2")];
      prismaMock.product.findMany.mockResolvedValue(products);
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });

      await service.findBestSellers("device-123");

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        }),
      );
    });

    it("should query only active non-deleted products", async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await service.findBestSellers("device-123");

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, deletedAt: null, sortOrder: { not: null } },
        }),
      );
    });
  });
});
