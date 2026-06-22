/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to spy private methods> */
import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "../cart.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock, settingsServiceMock } from "@shared/testing/mocks";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CartFactory,
  CartItemFactory,
  AnonymousCustomerFactory,
  ProductFactory,
  CustomerFactory,
} from "@shared/testing/factories";
import { SettingsService } from "../../settings/settings.service";

describe("CartService", () => {
  let service: CartService;

  let findAnonymousOrCustomerWithCartOrThrow: jest.SpyInstance;
  let formatCartSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SettingsService, useValue: settingsServiceMock },
      ],
    }).compile();

    service = module.get<CartService>(CartService);

    findAnonymousOrCustomerWithCartOrThrow = jest.spyOn(
      service as any,
      "findAnonymousOrCustomerWithCartOrThrow",
    );
    formatCartSpy = jest.spyOn(service as any, "formatCart");
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  const sessionCases = [
    {
      label: "deviceId session",
      session: { deviceId: "device-123" },
      mockEmptyCart: () => {
        prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
          cart: { items: [] },
        });
      },
      mockCustomerWithCart: (items: any[]) => {
        const customer = AnonymousCustomerFactory.createOne({
          cart: CartFactory.createOne({ items }),
        });
        prismaMock.anonymousCustomer.findUnique.mockResolvedValue(customer);
        return { deviceId: customer.deviceId };
      },
    },
    {
      label: "customerId session",
      session: { customerId: "customer-123" },
      mockEmptyCart: () => {
        prismaMock.customer.findFirst.mockResolvedValue({
          cart: { items: [] },
        });
      },
      mockCustomerWithCart: (items: any[]) => {
        const customer = CustomerFactory.createOne({
          cart: CartFactory.createOne({ items }),
        });
        prismaMock.customer.findFirst.mockResolvedValue(customer);
        return { customerId: customer.id };
      },
    },
  ];

  describe("formatCart", () => {
    beforeEach(() => {
      settingsServiceMock.findAll.mockResolvedValue({ DELIVERY_FEE: "200" });
    });

    it("should calculate total, subtotal, deliveryFee and productsCount correctly", async () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 10, stockQuantity: 20 }),
          quantity: 2,
        }),
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 20, stockQuantity: 20 }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart(cartItems);

      let productsCount = 0;
      const subtotal = cartItems.reduce((sum, item) => {
        productsCount += item.quantity;
        return sum + item.product.price * item.quantity;
      }, 0);
      const total = subtotal + 200;

      expect(result).toStrictEqual({
        products: cartItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price,
          compareAtPrice: item.product.compareAtPrice,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
        minOrderValue: 0,
        outsideBusinessHours: null,
        onBreak: null,
        deliveryFee: 200,
        subtotal,
        productsCount,
        total,
      });
    });

    it("should include compareAtPrice in product items", async () => {
      const compareAtPrice = 1500;
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({
            price: 10,
            stockQuantity: 20,
            compareAtPrice,
          }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart(cartItems);

      expect(result.products[0].compareAtPrice).toBe(compareAtPrice);
    });

    it("should include compareAtPrice as null when product has no compare price", async () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({
            price: 10,
            stockQuantity: 20,
            compareAtPrice: null,
          }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart(cartItems);

      expect(result.products[0].compareAtPrice).toBeNull();
    });

    it("should set remainingStock to 0 when product is inactive", async () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({
            price: 10,
            stockQuantity: 20,
            isActive: false,
          }),
          quantity: 2,
        }),
      ];

      const result = await (service as any).formatCart(cartItems);

      expect(result.products[0].remainingStock).toBe(0);
    });

    it("should expose minOrderValue, outsideBusinessHours and onBreak from settings", async () => {
      settingsServiceMock.findAll.mockResolvedValue({
        DELIVERY_FEE: "200",
        MIN_ORDER_VALUE: "5000",
        OUTSIDE_BUSINESS_HOURS: "Estamos fechados no momento.",
        ON_BREAK: "Estamos temporariamente fechados. Voltaremos em breve!",
      });

      const result = await (service as any).formatCart([]);

      expect(result.minOrderValue).toBe(5000);
      expect(result.outsideBusinessHours).toBe("Estamos fechados no momento.");
      expect(result.onBreak).toBe(
        "Estamos temporariamente fechados. Voltaremos em breve!",
      );
    });

    it("should set remainingStock when product stockQuantity is 10 or less", async () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 10, stockQuantity: 5 }),
          quantity: 1,
        }),
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 20, stockQuantity: 15 }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart(cartItems);

      expect(result.products[0].remainingStock).toBe(5);
      expect(result.products[1].remainingStock).toBeNull();
    });
  });

  describe("findAnonymousOrCustomerWithCartOrThrow", () => {
    const deviceId = "device-123";
    const customerId = "customer-123";

    it("should query anonymous customer with cart items when deviceId is present in session", async () => {
      const findUniqueSpy = jest.spyOn(
        prismaMock.anonymousCustomer,
        "findUnique",
      );

      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(
        AnonymousCustomerFactory.createOne({
          cart: CartFactory.createOne({
            items: [],
          }),
        }),
      );

      await (service as any).findAnonymousOrCustomerWithCartOrThrow({
        deviceId,
      });

      expect(findUniqueSpy).toHaveBeenCalledWith({
        where: { deviceId },
        include: {
          cart: {
            include: {
              items: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });
    });

    it("should query customer with cart items when customerId is present in session", async () => {
      const findFirstSpy = jest.spyOn(prismaMock.customer, "findFirst");

      prismaMock.customer.findFirst.mockResolvedValue(
        CustomerFactory.createOne({
          cart: CartFactory.createOne({
            items: [],
          }),
        }),
      );

      await (service as any).findAnonymousOrCustomerWithCartOrThrow({
        customerId,
      });

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: customerId },
        include: {
          cart: {
            include: {
              items: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });
    });

    it("should query customer (not anonymous) when session has both deviceId and customerId", async () => {
      const findFirstSpy = jest.spyOn(prismaMock.customer, "findFirst");

      prismaMock.customer.findFirst.mockResolvedValue(
        CustomerFactory.createOne({
          cart: CartFactory.createOne({ items: [] }),
        }),
      );

      await (service as any).findAnonymousOrCustomerWithCartOrThrow({
        deviceId,
        customerId,
      });

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: customerId },
        include: {
          cart: {
            include: {
              items: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });
      expect(prismaMock.anonymousCustomer.findUnique).not.toHaveBeenCalled();
    });

    it("should throw AppException when session has neither deviceId nor customerId", async () => {
      await expect(
        (service as any).findAnonymousOrCustomerWithCartOrThrow({}),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.INVALID_SESSION,
        message: "Sessão inválida",
        httpStatus: AppException.HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it("should throw AppException when anonymous customer is not found", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).findAnonymousOrCustomerWithCartOrThrow({
          deviceId,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.ANONYMOUS_CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw AppException when customer is not found", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        (service as any).findAnonymousOrCustomerWithCartOrThrow({
          customerId,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw AppException when cart is not found for anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        cart: null,
      });

      await expect(
        (service as any).findAnonymousOrCustomerWithCartOrThrow({ deviceId }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CART_NOT_FOUND,
        message: "Carrinho não encontrado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw AppException when cart is not found for customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        cart: null,
      });

      await expect(
        (service as any).findAnonymousOrCustomerWithCartOrThrow({ customerId }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CART_NOT_FOUND,
        message: "Carrinho não encontrado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("getCart", () => {
    const cart = CartFactory.createOne({ items: [] });

    it("should call findAnonymousOrCustomerWithCartOrThrow and formatCart with anonymous customer", async () => {
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue({
        cart,
      });

      await service.getCart({ deviceId: "device-123" });

      expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
    });

    it("should call findAnonymousOrCustomerWithCartOrThrow and formatCart with customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        cart,
      });

      await service.getCart({ customerId: "customer-123" });

      expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("addToCart", () => {
    describe.each(sessionCases)("$label", ({
      session,
      mockEmptyCart,
      mockCustomerWithCart,
    }) => {
      it("should add a product to the cart", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const cart = CartFactory.createOne({
          items: [CartItemFactory.createOne({ product })],
        });

        mockEmptyCart();
        prismaMock.product.findFirst.mockResolvedValue(product);
        prismaMock.cart.update.mockResolvedValue(cart);

        await service.addToCart(session, { productId: product.id });

        expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
        expect(formatCartSpy).toHaveBeenCalledTimes(1);
        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: { create: { productId: product.id, quantity: 1 } },
            }),
          }),
        );
      });

      it("should throw when product is already in cart", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product }),
        ]);

        await expect(
          service.addToCart(session, { productId: product.id }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
          message: "Produto já existe no carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });

      it("should throw PRODUCT_ALREADY_IN_CART when a concurrent request already added the product", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });

        mockEmptyCart();
        prismaMock.product.findFirst.mockResolvedValue(product);
        prismaMock.cart.update.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          }),
        );

        await expect(
          service.addToCart(session, { productId: product.id }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
          message: "Produto já existe no carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });

      it("should throw when product does not exist", async () => {
        mockEmptyCart();
        prismaMock.product.findFirst.mockResolvedValue(null);

        await expect(
          service.addToCart(session, { productId: "nonexistent" }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
          message: "Produto não encontrado",
          httpStatus: AppException.HttpStatus.NOT_FOUND,
        });
      });

      it("should throw when product stockQuantity is insufficient", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 0 });

        mockEmptyCart();
        prismaMock.product.findFirst.mockResolvedValue(product);

        await expect(
          service.addToCart(session, { productId: product.id }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
          message: "Produto sem estoque disponível",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });
    });
  });

  describe("incrementProductQuantity", () => {
    describe.each(sessionCases)("$label", ({
      session,
      mockEmptyCart,
      mockCustomerWithCart,
    }) => {
      it("should increment the quantity of an existing cart item", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product, quantity: 1 }),
        ]);
        settingsServiceMock.findAll.mockResolvedValue({ DELIVERY_FEE: "0" });
        prismaMock.cart.update.mockResolvedValue({ items: [] });

        await service.incrementProductQuantity(session, {
          productId: product.id,
        });

        expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
        expect(formatCartSpy).toHaveBeenCalledTimes(1);
        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: {
                update: expect.objectContaining({
                  data: { quantity: { increment: 1 } },
                }),
              },
            }),
          }),
        );
      });

      it("should throw when product is not in cart", async () => {
        mockEmptyCart();

        await expect(
          service.incrementProductQuantity(session, {
            productId: "non-existent-product-id",
          }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
          message: "Produto não existe no carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });

      it("should throw when product is inactive", async () => {
        const product = ProductFactory.createOne({
          stockQuantity: 20,
          isActive: false,
        });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product, quantity: 1 }),
        ]);

        await expect(
          service.incrementProductQuantity(session, {
            productId: product.id,
          }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_INACTIVE,
          message: "Produto não está mais disponível",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.cart.update).not.toHaveBeenCalled();
      });

      it("should throw when incrementing exceeds stockQuantity", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 5 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product, quantity: 5 }),
        ]);

        await expect(
          service.incrementProductQuantity(session, {
            productId: product.id,
          }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
          message: "Quantidade solicitada excede o estoque disponível",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });

      it("should not check stockQuantity when stockQuantity is greater than 10", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 11 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product, quantity: 11 }),
        ]);
        settingsServiceMock.findAll.mockResolvedValue({ DELIVERY_FEE: "0" });
        prismaMock.cart.update.mockResolvedValue({ items: [] });

        await service.incrementProductQuantity(session, {
          productId: product.id,
        });

        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: {
                update: expect.objectContaining({
                  data: { quantity: { increment: 1 } },
                }),
              },
            }),
          }),
        );
      });
    });
  });

  describe("decrementProductQuantity", () => {
    describe.each(sessionCases)("$label", ({
      session,
      mockEmptyCart,
      mockCustomerWithCart,
    }) => {
      it("should decrement quantity when it is greater than 1", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product, quantity: 3 }),
        ]);
        prismaMock.cart.update.mockResolvedValue({ items: [] });

        await service.decrementProductQuantity(session, {
          productId: product.id,
        });

        expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
        expect(formatCartSpy).toHaveBeenCalledTimes(1);
        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: {
                update: expect.objectContaining({
                  data: { quantity: { decrement: 1 } },
                }),
              },
            }),
          }),
        );
      });

      it("should remove the item when quantity is 1", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product }),
        ]);
        prismaMock.cart.update.mockResolvedValue({ items: [] });

        await service.decrementProductQuantity(session, {
          productId: product.id,
        });

        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: { deleteMany: { productId: product.id } },
            }),
          }),
        );
      });

      it("should throw when product is not in cart", async () => {
        mockEmptyCart();

        await expect(
          service.decrementProductQuantity(session, {
            productId: "non-existent-product-id",
          }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
          message: "Produto não existe no carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });
    });
  });

  describe("removeFromCart", () => {
    describe.each(sessionCases)("$label", ({
      session,
      mockEmptyCart,
      mockCustomerWithCart,
    }) => {
      it("should remove a product from the cart", async () => {
        const product = ProductFactory.createOne({ stockQuantity: 20 });
        const session = mockCustomerWithCart([
          CartItemFactory.createOne({ product }),
        ]);
        prismaMock.cart.update.mockResolvedValue({ items: [] });

        await service.removeFromCart(session, { productId: product.id });

        expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
        expect(formatCartSpy).toHaveBeenCalledTimes(1);
        expect(prismaMock.cart.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: { deleteMany: { productId: product.id } },
            }),
          }),
        );
      });

      it("should throw when product is not in cart", async () => {
        mockEmptyCart();

        await expect(
          service.removeFromCart(session, { productId: "product-id" }),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
          message: "Produto não existe no carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
      });
    });
  });
});
