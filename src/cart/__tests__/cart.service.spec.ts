import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "../cart.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";

const makeProduct = (id: string, price = 1000, stock = 100) => ({
  id,
  name: `Product ${id}`,
  description: `Desc ${id}`,
  price,
  imageUrl: `http://img/${id}`,
  isActive: true,
  deletedAt: null,
  stock,
});

const makeCartItem = (
  productId: string,
  quantity = 1,
  itemId = `item-${productId}`,
) => ({
  id: itemId,
  productId,
  quantity,
  product: makeProduct(productId),
});

const makeCustomerWithCart = (
  items: ReturnType<typeof makeCartItem>[] = [],
) => ({
  id: "customer-id",
  deviceId: "device-123",
  isActive: true,
  deletedAt: null,
  cart: {
    id: "cart-id",
    customerId: "customer-id",
    items,
  },
});

describe("CartService", () => {
  let service: CartService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getCart", () => {
    it("should return formatted cart for a valid customer", async () => {
      const items = [makeCartItem("p1", 2)];
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart(items),
      );

      const result = await service.getCart("device-123");

      const total =
        items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        ) + 200;
      const subtotal = items.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      const productsCount = items.reduce((sum, item) => sum + item.quantity, 0);

      expect(result).toEqual({
        total,
        subtotal,
        deliveryFee: 200,
        productsCount,
        products: items.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price * item.quantity,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
      });
    });

    it("should return zeroed values when cart is empty", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );

      const result = await service.getCart("device-123");

      expect(result).toEqual({
        total: 0,
        subtotal: 0,
        deliveryFee: 0,
        productsCount: 0,
        products: [],
      });
    });

    it("should return zeroed deliveryFee when cart is empty", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );

      const result = await service.getCart("device-123");

      expect(result.deliveryFee).toBe(0);
    });

    it("should throw AppException when customer is not found", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(service.getCart("device-123")).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado para este dispositivo",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw AppException when cart is not found for customer", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: "customer-id",
        deviceId: "device-123",
        isActive: true,
        deletedAt: null,
        cart: null,
      });

      await expect(service.getCart("device-123")).rejects.toMatchObject({
        code: AppException.errorCodes.cart.CUSTOMER_CART_NOT_FOUND,
        message: "Carrinho não encontrado para este cliente",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("addToCart", () => {
    it("should add a product to the cart", async () => {
      const items = [makeCartItem("p1")];
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );
      prismaMock.product.findFirst.mockResolvedValue(makeProduct("p1"));
      prismaMock.cart.update.mockResolvedValue({ items });

      const result = await service.addToCart("device-123", { productId: "p1" });

      const total =
        items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        ) + 200;
      const subtotal = items.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      const productsCount = items.reduce((sum, item) => sum + item.quantity, 0);

      expect(result).toEqual({
        total,
        subtotal,
        deliveryFee: 200,
        productsCount,
        products: items.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price * item.quantity,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
      });

      expect(prismaMock.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { create: { productId: "p1", quantity: 1 } },
          }),
        }),
      );
    });

    it("should throw when product is already in cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([makeCartItem("p1")]),
      );

      await expect(
        service.addToCart("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
        message: "Produto já existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw when product does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(
        service.addToCart("device-123", { productId: "p-nonexistent" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
        message: "Produto não encontrado",
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should throw when product stock is insufficient", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );
      prismaMock.product.findFirst.mockResolvedValue(
        makeProduct("p1", 1000, 0),
      );

      await expect(
        service.addToCart("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        message: "Produto sem estoque disponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("incrementProductQuantity", () => {
    it("should increment the quantity of an existing cart item", async () => {
      const items = [makeCartItem("p1", 1)];
      const updatedItems = [makeCartItem("p1", 2)];

      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart(items),
      );
      prismaMock.cart.update.mockResolvedValue({
        items: updatedItems,
      });

      const result = await service.incrementProductQuantity("device-123", {
        productId: "p1",
      });

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

      const total =
        updatedItems.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        ) + 200;
      const subtotal = updatedItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      const productsCount = updatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      expect(result).toEqual({
        total,
        subtotal,
        deliveryFee: 200,
        productsCount,
        products: updatedItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price * item.quantity,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
      });
    });

    it("should throw when product is not in cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );

      await expect(
        service.incrementProductQuantity("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw when incrementing exceeds stock", async () => {
      const items = [
        { ...makeCartItem("p1", 1), product: makeProduct("p1", 1000, 1) },
      ];
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart(items),
      );

      await expect(
        service.incrementProductQuantity("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        message: "Quantidade solicitada excede o estoque disponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("decrementProductQuantity", () => {
    it("should decrement quantity when it is greater than 1", async () => {
      const items = [makeCartItem("p1", 3)];
      const updatedItems = [makeCartItem("p1", 2)];
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart(items),
      );
      prismaMock.cart.update.mockResolvedValue({
        items: updatedItems,
      });

      const result = await service.decrementProductQuantity("device-123", {
        productId: "p1",
      });

      const total =
        updatedItems.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        ) + 200;
      const subtotal = updatedItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      const productsCount = updatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

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

      expect(result).toEqual({
        total,
        subtotal,
        deliveryFee: 200,
        productsCount,
        products: updatedItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price * item.quantity,
          imageUrl: item.product.imageUrl,
          remainingStock: null,
          quantity: item.quantity,
        })),
      });
    });

    it("should remove the item when quantity is 1", async () => {
      const item = makeCartItem("p1", 1);
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([item]),
      );
      prismaMock.cart.update.mockResolvedValue({ items: [] });

      const result = await service.decrementProductQuantity("device-123", {
        productId: "p1",
      });

      expect(prismaMock.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { deleteMany: { productId: "p1" } },
          }),
        }),
      );
      expect(result).toEqual({
        total: 0,
        subtotal: 0,
        deliveryFee: 0,
        productsCount: 0,
        products: [],
      });
    });

    it("should throw when product is not in cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );

      await expect(
        service.decrementProductQuantity("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe("removeFromCart", () => {
    it("should remove a product from the cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([makeCartItem("p1")]),
      );
      prismaMock.cart.update.mockResolvedValue({ items: [] });

      const result = await service.removeFromCart("device-123", {
        productId: "p1",
      });

      expect(prismaMock.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { deleteMany: { productId: "p1" } },
          }),
        }),
      );

      expect(result).toEqual({
        total: 0,
        subtotal: 0,
        deliveryFee: 0,
        productsCount: 0,
        products: [],
      });
    });

    it("should throw when product is not in cart", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(
        makeCustomerWithCart([]),
      );

      await expect(
        service.removeFromCart("device-123", { productId: "p1" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        message: "Produto não existe no carrinho",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });
  });
});
