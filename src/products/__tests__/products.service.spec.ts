import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "../../shared/database/prisma/prisma.service";

const prismaMock = {
  product: {
    findMany: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
  },
};

const makeProduct = (id: string) => ({
  id,
  name: `Product ${id}`,
  description: `Description ${id}`,
  price: 1000,
  imageUrl: `http://img/${id}`,
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
    it("should return products with isInCart=true for products in customer cart", async () => {
      const products = [makeProduct("p1"), makeProduct("p2")];
      prismaMock.product.findMany.mockResolvedValue(products);
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [{ productId: "p1" }] },
      });

      const result = await service.findBestSellers("device-123");

      expect(result).toStrictEqual([
        { ...products[0], isInCart: true },
        { ...products[1], isInCart: false },
      ]);
    });

    it("should return products with isInCart=false when cart is empty", async () => {
      const products = [makeProduct("p1")];
      prismaMock.product.findMany.mockResolvedValue(products);
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });

      const result = await service.findBestSellers("device-123");

      expect(result).toStrictEqual([{ ...products[0], isInCart: false }]);
    });

    it("should return products with isInCart=false when customer is not found", async () => {
      const products = [makeProduct("p1")];
      prismaMock.product.findMany.mockResolvedValue(products);
      prismaMock.customer.findUnique.mockResolvedValue(null);

      const result = await service.findBestSellers("device-123");

      expect(result).toStrictEqual([{ ...products[0], isInCart: false }]);
    });

    it("should query only active non-deleted products", async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await service.findBestSellers("device-123");

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, deletedAt: null },
        }),
      );
    });
  });
});
