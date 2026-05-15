/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { CustomersService } from "../../customers/customers.service";
import { prismaMock } from "@shared/testing/mocks";
import {
  AnonymousCustomerFactory,
  CartFactory,
  CartItemFactory,
  ProductFactory,
} from "@shared/testing/factories";

describe("ProductsService", () => {
  let service: ProductsService;
  let customersServiceMock: jest.Mocked<
    Pick<CustomersService, "findCustomerOrAnonymous">
  >;

  const session = { deviceId: "device-123" };

  beforeEach(async () => {
    customersServiceMock = {
      findCustomerOrAnonymous: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CustomersService, useValue: customersServiceMock },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findBestSellers", () => {
    const anonymousCustomerWithEmptyCart = AnonymousCustomerFactory.createOne({
      cart: CartFactory.createOne({ items: [] }),
    });

    it("should call calculateQuantityInCart with the correct cart items from anonymous customer", async () => {
      const products = ProductFactory.createMany(2, { stock: 20 });

      const calculateQuantityInCartSpy = jest.spyOn(
        service as any,
        "calculateQuantityInCart",
      );
      const cartItem = CartItemFactory.createOne({
        quantity: 2,
        product: products[0],
      });
      const cart = CartFactory.createOne({
        items: [cartItem],
      });

      prismaMock.product.findMany.mockResolvedValue(products);
      customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
        anonymousCustomer: { cart },
        customer: null,
      });

      await service.findBestSellers(session);

      expect(calculateQuantityInCartSpy).toHaveBeenCalledWith(cart.items);
    });

    describe("quantityInCart", () => {
      it("should return products with quantityInCart=1 for products in anonymous customer cart", async () => {
        const products = ProductFactory.createMany(2, { stock: 20 });

        const cartItem = CartItemFactory.createOne({
          quantity: 1,
          product: products[0],
        });
        const cart = CartFactory.createOne({
          items: [cartItem],
        });

        prismaMock.product.findMany.mockResolvedValue(products);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: { cart },
          customer: null,
        });

        const result = await service.findBestSellers(session);

        expect(result[0].quantityInCart).toBe(1);
        expect(result[1].quantityInCart).toBe(0);

        expect(result[0].remainingStock).toBeNull();
        expect(result[1].remainingStock).toBeNull();
      });

      it("should return products with quantityInCart=0 when cart is empty", async () => {
        const products = ProductFactory.createOne({ stock: 20 });

        prismaMock.product.findMany.mockResolvedValue([products]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        const result = await service.findBestSellers(session);

        expect(result[0].quantityInCart).toBe(0);
        expect(result[0].remainingStock).toBeNull();
      });

      it("should return products with quantityInCart=0 when anonymous customer is not found", async () => {
        const products = ProductFactory.createOne({ stock: 20 });

        prismaMock.product.findMany.mockResolvedValue([products]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: null,
          customer: null,
        });

        const result = await service.findBestSellers(session);

        expect(result[0].quantityInCart).toBe(0);
        expect(result[0].remainingStock).toBeNull();
      });
    });

    describe("remainingStock", () => {
      it("should return products without remainingStock when stock is greater than 10", async () => {
        const product = ProductFactory.createOne({ stock: 11 });

        prismaMock.product.findMany.mockResolvedValue([product]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        const result = await service.findBestSellers(session);

        expect(result[0].remainingStock).toBeNull();
        expect(result[0].quantityInCart).toBe(0);
      });

      it("should return products with remainingStock when stock is 10 or less", async () => {
        const product = ProductFactory.createOne({ stock: 5 });

        prismaMock.product.findMany.mockResolvedValue([product]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        const result = await service.findBestSellers(session);

        expect(result[0].remainingStock).toBe(5);
        expect(result[0].quantityInCart).toBe(0);
      });
    });

    describe("category filtering", () => {
      it("should filter products by category when category is provided", async () => {
        prismaMock.product.findMany.mockResolvedValue([]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        await service.findBestSellers(session, "Bebidas");

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              category: { name: "Bebidas" },
            }),
          }),
        );
      });

      it("should not filter by category when category is not provided", async () => {
        prismaMock.product.findMany.mockResolvedValue([]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        await service.findBestSellers(session);

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
        prismaMock.product.findMany.mockResolvedValue([]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        await service.findBestSellers(session);

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              sortOrder: { not: null },
            }),
          }),
        );
      });

      it("should not filter products by sortOrder when category is provided", async () => {
        prismaMock.product.findMany.mockResolvedValue([]);
        customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
          anonymousCustomer: anonymousCustomerWithEmptyCart,
          customer: null,
        });

        await service.findBestSellers(session, "Bebidas");

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
      prismaMock.product.findMany.mockResolvedValue([]);
      customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
        anonymousCustomer: anonymousCustomerWithEmptyCart,
        customer: null,
      });

      await service.findBestSellers(session);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        }),
      );
    });

    it("should query only active non-deleted products", async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      customersServiceMock.findCustomerOrAnonymous.mockResolvedValue({
        anonymousCustomer: null,
        customer: null,
      });

      await service.findBestSellers(session);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, deletedAt: null, sortOrder: { not: null } },
        }),
      );
    });
  });

  describe("calculateQuantityInCart", () => {
    it("should return an empty object when items array is empty", () => {
      const result = (service as any).calculateQuantityInCart([]);

      expect(result).toEqual({});
    });

    it("should return the correct quantity for a single item", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 3 },
      ]);

      expect(result).toEqual({ "product-1": 3 });
    });

    it("should sum quantities for multiple items with the same productId", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 2 },
        { productId: "product-1", quantity: 5 },
      ]);

      expect(result).toEqual({ "product-1": 7 });
    });

    it("should handle multiple different products independently", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 2 },
        { productId: "product-2", quantity: 4 },
        { productId: "product-1", quantity: 1 },
      ]);

      expect(result).toEqual({ "product-1": 3, "product-2": 4 });
    });
  });
});
