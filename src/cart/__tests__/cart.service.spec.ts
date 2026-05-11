/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to spy private methods> */
import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "../cart.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import {
  CartFactory,
  CartItemFactory,
  CustomerFactory,
  ProductFactory,
} from "@shared/testing/factories";

describe("CartService", () => {
  let service: CartService;

  let findCustomerSpy: jest.SpyInstance;
  let formatCartSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CartService>(CartService);

    findCustomerSpy = jest.spyOn(service as any, "findCustomerWithCartOrThrow");
    formatCartSpy = jest.spyOn(service as any, "formatCart");
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("formatCart", () => {
    it("should calculate total, subtotal, deliveryFee and productsCount correctly", () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 10, stock: 20 }),
          quantity: 2,
        }),
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 20, stock: 20 }),
          quantity: 1,
        }),
      ];

      const result = (service as any).formatCart(cartItems);

      const deliveryFee = 200;
      let productsCount = 0;
      const subtotal = cartItems.reduce((sum, item) => {
        productsCount += item.quantity;
        return sum + item.product.price * item.quantity;
      }, 0);
      const total = subtotal + deliveryFee;

      expect(result).toStrictEqual({
        products: cartItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price * item.quantity,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
        deliveryFee,
        subtotal,
        productsCount,
        total,
      });
    });

    it("should set deliveryFee to 0 when cart is empty", () => {
      const result = (service as any).formatCart([]);

      expect(result).toStrictEqual({
        products: [],
        deliveryFee: 0,
        subtotal: 0,
        productsCount: 0,
        total: 0,
      });
    });

    it("should set remainingStock when product stock is 10 or less", () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 10, stock: 5 }),
          quantity: 1,
        }),
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 20, stock: 15 }),
          quantity: 1,
        }),
      ];

      const result = (service as any).formatCart(cartItems);

      expect(result.products[0].remainingStock).toBe(5);
      expect(result.products[1].remainingStock).toBeNull();
    });
  });

  describe("findCustomerWithCartOrThrow", () => {
    it("should return customer with cart and items", async () => {
      const products = ProductFactory.createMany(2, { stock: 20 });
      const cart = CartFactory.createOne({
        items: products.map((product) =>
          CartItemFactory.createOne({ product, quantity: 1 }),
        ),
      });
      const customer = CustomerFactory.createOne({
        cart,
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      const result = await (service as any).findCustomerWithCartOrThrow(
        customer.deviceId!,
      );

      expect(result).toEqual({
        ...customer,
        cart: {
          ...cart,
          items: cart.items,
        },
      });
    });

    it("should throw AppException when customer is not found", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).findCustomerWithCartOrThrow("nonexistent"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado para este dispositivo",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw AppException when cart is not found for customer", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: null,
      });

      await expect(
        (service as any).findCustomerWithCartOrThrow("device-123"),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CUSTOMER_CART_NOT_FOUND,
        message: "Carrinho não encontrado para este cliente",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("getCart", () => {
    it("should return formatted cart for a valid customer", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: {
          items: [],
        },
      });

      await service.getCart("device-123");

      expect(findCustomerSpy).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("addToCart", () => {
    it("should add a product to the cart", async () => {
      const product = ProductFactory.createOne({ stock: 20 });
      const cart = CartFactory.createOne({
        items: [
          CartItemFactory.createOne({
            product,
          }),
        ],
      });

      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });
      prismaMock.product.findFirst.mockResolvedValue(product);
      prismaMock.cart.update.mockResolvedValue(cart);

      await service.addToCart("device-123", {
        productId: product.id,
      });

      expect(findCustomerSpy).toHaveBeenCalledTimes(1);
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
      const product = ProductFactory.createOne({ stock: 20 });

      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [
            CartItemFactory.createOne({
              product,
            }),
          ],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        service.addToCart(customer.deviceId!, { productId: product.id }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
        message: "Produto já existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw when product does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(
        service.addToCart("device-123", { productId: "nonexistent" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
        message: "Produto não encontrado",
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should throw when product stock is insufficient", async () => {
      const product = ProductFactory.createOne({ stock: 0 });

      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });
      prismaMock.product.findFirst.mockResolvedValue(product);

      await expect(
        service.addToCart("device-123", { productId: product.id }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        message: "Produto sem estoque disponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("incrementProductQuantity", () => {
    it("should increment the quantity of an existing cart item", async () => {
      const product = ProductFactory.createOne({ stock: 20 });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [
            CartItemFactory.createOne({
              product,
              quantity: 1,
            }),
          ],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.cart.update.mockResolvedValue({
        items: [],
      });

      await service.incrementProductQuantity(customer.deviceId!, {
        productId: product.id,
      });

      expect(findCustomerSpy).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);

      expect(prismaMock.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              update: expect.objectContaining({
                data: { quantity: 2 },
              }),
            },
          }),
        }),
      );
    });

    it("should throw when product is not in cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });

      await expect(
        service.incrementProductQuantity("device-123", {
          productId: "non-existent-product-id",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw when incrementing exceeds stock", async () => {
      const product = ProductFactory.createOne({ stock: 5 });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [
            CartItemFactory.createOne({
              product,
              quantity: 5,
            }),
          ],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        service.incrementProductQuantity(customer.deviceId!, {
          productId: product.id,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        message: "Quantidade solicitada excede o estoque disponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("decrementProductQuantity", () => {
    it("should decrement quantity when it is greater than 1", async () => {
      const product = ProductFactory.createOne({ stock: 20 });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [
            CartItemFactory.createOne({
              product,
              quantity: 3,
            }),
          ],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.cart.update.mockResolvedValue({
        items: [],
      });

      await service.decrementProductQuantity(customer.deviceId!, {
        productId: product.id,
      });

      expect(findCustomerSpy).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);

      expect(prismaMock.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              update: expect.objectContaining({
                data: { quantity: 2 },
              }),
            },
          }),
        }),
      );
    });

    it("should remove the item when quantity is 1", async () => {
      const product = ProductFactory.createOne({ stock: 20 });

      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [CartItemFactory.createOne({ product })],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.cart.update.mockResolvedValue({
        items: [],
      });

      await service.decrementProductQuantity(customer.deviceId!, {
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
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        service.decrementProductQuantity(customer.deviceId!, {
          productId: "non-existent-product-id",
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("removeFromCart", () => {
    it("should remove a product from the cart", async () => {
      const product = ProductFactory.createOne({ stock: 20 });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [
            CartItemFactory.createOne({
              product,
            }),
          ],
        }),
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.cart.update.mockResolvedValue({
        items: [],
      });

      await service.removeFromCart(customer.deviceId!, {
        productId: product.id,
      });

      expect(findCustomerSpy).toHaveBeenCalledTimes(1);
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
      prismaMock.customer.findUnique.mockResolvedValue({
        cart: { items: [] },
      });

      await expect(
        service.removeFromCart("device-123", { productId: "product-id" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });
});
