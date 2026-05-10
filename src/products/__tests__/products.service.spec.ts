import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import {
  CartFactory,
  CartItemFactory,
  ProductFactory,
} from "@shared/testing/factories";

describe("ProductsService", () => {
  let service: ProductsService;

  beforeEach(async () => {
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
        const products = ProductFactory.createMany(2);
        const cartItem = CartItemFactory.createOne({
          productId: products[0].id,
          quantity: 1,
        });
        const cart = CartFactory.createOne({
          items: [cartItem],
        });

        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
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
        const product = ProductFactory.createOne();
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue([product]);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...product,
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });

      it("should return products with quantityInCart=0 when customer is not found", async () => {
        const product = ProductFactory.createOne();
        prismaMock.product.findMany.mockResolvedValue([product]);
        prismaMock.customer.findUnique.mockResolvedValue(null);

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...product,
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });
    });

    describe("remainingStock", () => {
      it("should return products without remainingStock when stock is greater than 10", async () => {
        const product = ProductFactory.createOne({ stock: 11 });
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue([product]);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...product,
            quantityInCart: 0,
            remainingStock: null,
          },
        ]);
      });

      it("should return products with remainingStock when stock is 10 or less", async () => {
        const product = ProductFactory.createOne({ stock: 5 });
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue([product]);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
        });

        const result = await service.findBestSellers("device-123");

        expect(result).toStrictEqual([
          {
            ...product,
            quantityInCart: 0,
            remainingStock: 5,
          },
        ]);
      });
    });

    describe("category filtering", () => {
      it("should filter products by category when category is provided", async () => {
        const products = ProductFactory.createMany(2);
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
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
        const products = ProductFactory.createMany(2);
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
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
        const products = ProductFactory.createMany(2);
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
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
        const products = ProductFactory.createMany(2);
        const cart = CartFactory.createOne();

        prismaMock.product.findMany.mockResolvedValue(products);
        prismaMock.customer.findUnique.mockResolvedValue({
          cart,
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
      const products = ProductFactory.createMany(2);
      const cart = CartFactory.createOne();

      prismaMock.product.findMany.mockResolvedValue(products);
      prismaMock.customer.findUnique.mockResolvedValue({
        cart,
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
