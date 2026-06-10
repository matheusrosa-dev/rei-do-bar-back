/** biome-ignore-all lint/suspicious/noExplicitAny: <some mocks has to be any> */
import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import {
  AnonymousCustomerFactory,
  CartFactory,
  CartItemFactory,
  CustomerFactory,
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
    const sessionVariants = [
      {
        label: "anonymous customer",
        session: { deviceId: "device-123" },
        mockWithCart: (value: any) =>
          prismaMock.anonymousCustomer.findUnique.mockResolvedValue(value),
        customerWithEmptyCart: AnonymousCustomerFactory.createOne({
          cart: CartFactory.createOne({ items: [] }),
        }),
      },
      {
        label: "customer",
        session: { customerId: "customer-123" },
        mockWithCart: (value: any) =>
          prismaMock.customer.findFirst.mockResolvedValue(value),
        customerWithEmptyCart: CustomerFactory.createOne({
          cart: CartFactory.createOne({ items: [] }),
        }),
      },
    ];

    describe.each(sessionVariants)("$label", ({
      session,
      mockWithCart,
      customerWithEmptyCart,
    }) => {
      it("should call calculateQuantityInCart with cart items", async () => {
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
        mockWithCart({ id: "customer-id", cart });

        await service.findBestSellers(session);

        expect(calculateQuantityInCartSpy).toHaveBeenCalledWith(cart.items);
      });

      it("should call findAnonymousOrCustomerWithCart with session", async () => {
        const products = ProductFactory.createMany(2, { stock: 20 });

        const findAnonymousOrCustomerWithCartSpy = jest.spyOn(
          service as any,
          "findAnonymousOrCustomerWithCart",
        );

        prismaMock.product.findMany.mockResolvedValue(products);
        mockWithCart(customerWithEmptyCart);

        await service.findBestSellers(session);

        expect(findAnonymousOrCustomerWithCartSpy).toHaveBeenCalledWith(
          session,
        );
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
          mockWithCart({ id: "customer-id", cart });

          const result = await service.findBestSellers(session);

          expect(result[0].quantityInCart).toBe(1);
          expect(result[1].quantityInCart).toBe(0);

          expect(result[0].remainingStock).toBeNull();
          expect(result[1].remainingStock).toBeNull();
        });

        it("should return products with quantityInCart=0 when cart is empty", async () => {
          const products = ProductFactory.createOne({ stock: 20 });

          prismaMock.product.findMany.mockResolvedValue([products]);
          mockWithCart(customerWithEmptyCart);

          const result = await service.findBestSellers(session);

          expect(result[0].quantityInCart).toBe(0);
          expect(result[0].remainingStock).toBeNull();
        });

        it("should return products with quantityInCart=0 when customer is not found", async () => {
          const products = ProductFactory.createOne({ stock: 20 });

          prismaMock.product.findMany.mockResolvedValue([products]);
          mockWithCart(null);

          const result = await service.findBestSellers(session);

          expect(result[0].quantityInCart).toBe(0);
          expect(result[0].remainingStock).toBeNull();
        });
      });

      describe("remainingStock", () => {
        it("should return products without remainingStock when stock is greater than 10", async () => {
          const product = ProductFactory.createOne({ stock: 11 });

          prismaMock.product.findMany.mockResolvedValue([product]);
          mockWithCart(customerWithEmptyCart);

          const result = await service.findBestSellers(session);

          expect(result[0].remainingStock).toBeNull();
          expect(result[0].quantityInCart).toBe(0);
        });

        it("should return products with remainingStock when stock is 10 or less", async () => {
          const product = ProductFactory.createOne({ stock: 5 });

          prismaMock.product.findMany.mockResolvedValue([product]);
          mockWithCart(customerWithEmptyCart);

          const result = await service.findBestSellers(session);

          expect(result[0].remainingStock).toBe(5);
          expect(result[0].quantityInCart).toBe(0);
        });
      });

      describe("category filtering", () => {
        it("should filter products by category when category is provided", async () => {
          prismaMock.product.findMany.mockResolvedValue([]);
          mockWithCart(customerWithEmptyCart);

          await service.findBestSellers(session, { category: "Bebidas" });

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
          mockWithCart(customerWithEmptyCart);

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

      describe("searchTerm filtering", () => {
        it("should filter by name, description, and category name when searchTerm is provided", async () => {
          prismaMock.product.findMany.mockResolvedValue([]);
          mockWithCart(customerWithEmptyCart);

          await service.findBestSellers(session, { searchTerm: "burger" });

          expect(prismaMock.product.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                OR: [
                  { name: { contains: "burger", mode: "insensitive" } },
                  { description: { contains: "burger", mode: "insensitive" } },
                  {
                    category: {
                      name: { contains: "burger", mode: "insensitive" },
                    },
                  },
                ],
              }),
            }),
          );
        });

        it("should not include OR clause when searchTerm is not provided", async () => {
          prismaMock.product.findMany.mockResolvedValue([]);
          mockWithCart(customerWithEmptyCart);

          await service.findBestSellers(session);

          expect(prismaMock.product.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.not.objectContaining({ OR: expect.anything() }),
            }),
          );
        });
      });

      describe("sortOrder filtering", () => {
        it("should filter products with sortOrder not null when no filter is provided", async () => {
          prismaMock.product.findMany.mockResolvedValue([]);
          mockWithCart(customerWithEmptyCart);

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
          mockWithCart(customerWithEmptyCart);

          await service.findBestSellers(session, { category: "Bebidas" });

          expect(prismaMock.product.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.not.objectContaining({
                sortOrder: { not: null },
              }),
            }),
          );
        });

        it("should not filter products by sortOrder when searchTerm is provided", async () => {
          prismaMock.product.findMany.mockResolvedValue([]);
          mockWithCart(customerWithEmptyCart);

          await service.findBestSellers(session, { searchTerm: "burger" });

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
        mockWithCart(customerWithEmptyCart);

        await service.findBestSellers(session);

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { sortOrder: "asc" },
          }),
        );
      });

      it("should query only active products", async () => {
        prismaMock.product.findMany.mockResolvedValue([]);
        mockWithCart(null);

        await service.findBestSellers(session);

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              isActive: true,
            }),
          }),
        );
      });
    });
  });

  describe("findAnonymousOrCustomerWithCart", () => {
    it("should query anonymous customer with cart items when deviceId is present in session", async () => {
      const findUniqueSpy = jest.spyOn(
        prismaMock.anonymousCustomer,
        "findUnique",
      );

      await (service as any).findAnonymousOrCustomerWithCart({
        deviceId: "device-123",
      });

      expect(findUniqueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId: "device-123" },
          select: {
            cart: {
              select: {
                items: {
                  select: { productId: true, quantity: true },
                },
              },
            },
          },
        }),
      );
    });

    it("should query customer with cart items when customerId is present in session", async () => {
      const findFirstSpy = jest.spyOn(prismaMock.customer, "findFirst");
      const sessionWithCustomerId = { customerId: "customer-123" };

      await (service as any).findAnonymousOrCustomerWithCart(
        sessionWithCustomerId,
      );

      expect(findFirstSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionWithCustomerId.customerId },
          select: {
            cart: {
              select: {
                items: {
                  select: { productId: true, quantity: true },
                },
              },
            },
          },
        }),
      );
    });

    it("should throw AppException when session does not have deviceId or customerId", () => {
      const invalidSession = {};

      expect(() =>
        (service as any).findAnonymousOrCustomerWithCart(invalidSession),
      ).toThrow(AppException);
    });

    it("should throw AppException when session has both deviceId and customerId", () => {
      const invalidSession = {
        deviceId: "device-123",
        customerId: "customer-123",
      };

      expect(() =>
        (service as any).findAnonymousOrCustomerWithCart(invalidSession),
      ).toThrow(AppException);
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
