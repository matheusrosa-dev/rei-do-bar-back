/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to access private methods> */
import { Test, TestingModule } from "@nestjs/testing";
import { SettingKey } from "@shared/database/prisma/generated/client";
import {
  OrderStatus,
  PaymentType,
} from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import {
  AddressFactory,
  CartFactory,
  CartItemFactory,
  CustomerFactory,
  ProductFactory,
} from "@shared/testing/factories";
import { prismaMock } from "@shared/testing/mocks";
import { OrdersService } from "../orders.service";
import { SettingsService } from "../../settings/settings.service";

const customerId = "customer-uuid";

const buildCustomer = (items: any[], overrides: any = {}) =>
  CustomerFactory.createOne({
    id: customerId,
    name: "João da Silva",
    addresses: [
      AddressFactory.createOne({
        customerId,
        street: "Rua A",
        number: "100",
        neighborhood: "Centro",
        zipCode: "12345678",
        isMain: true,
      }),
    ],
    cart: CartFactory.createOne({ id: "cart-uuid", items }),
    ...overrides,
  });

describe("OrdersService", () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        SettingsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createOrder", () => {
    const dto = { paymentType: PaymentType.CASH };

    it("should create the order, decrement stock, clear the cart and return the orders", async () => {
      const checkCustomerSpy = jest.spyOn(
        service as any,
        "checkIfCustomerIsAptToCreateOrder",
      );
      const checkItemsSpy = jest.spyOn(
        service as any,
        "checkIfThereAreInvalidItemsInCart",
      );
      const findAndFormatOrdersSpy = jest.spyOn(
        service as any,
        "findAndFormatOrders",
      );

      const product1 = ProductFactory.createOne({ price: 10, stock: 20 });
      const product2 = ProductFactory.createOne({ price: 20, stock: 30 });
      const items = [
        CartItemFactory.createOne({ product: product1, quantity: 2 }),
        CartItemFactory.createOne({ product: product2, quantity: 3 }),
      ];
      const customer = buildCustomer(items);

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "200", isActive: true },
      ]);

      const createdOrder = {
        id: "order-uuid",
        orderNumber: 1000,
        deliveryFee: 200,
        items: [
          { price: 10, quantity: 2 },
          { price: 20, quantity: 3 },
        ],
      };
      prismaMock.order.findMany.mockResolvedValue([createdOrder]);

      const result = await service.createOrder(customerId, dto);

      expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
        where: { id: customerId },
        include: {
          addresses: true,
          cart: { include: { items: { include: { product: true } } } },
        },
      });
      expect(prismaMock.order.create).toHaveBeenCalledWith({
        data: {
          customerId: customer.id,
          address: "Rua A, 100 - Centro/12345678",
          status: OrderStatus.PENDING,
          deliveryFee: 200,
          paymentType: PaymentType.CASH,
          items: {
            createMany: {
              data: [
                {
                  name: product1.name,
                  price: product1.price,
                  quantity: 2,
                  imageUrl: product1.imageUrl,
                  productId: product1.id,
                },
                {
                  name: product2.name,
                  price: product2.price,
                  quantity: 3,
                  imageUrl: product2.imageUrl,
                  productId: product2.id,
                },
              ],
            },
          },
        },
      });
      expect(prismaMock.product.updateMany).toHaveBeenCalledTimes(2);
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: product1.id, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: product2.id, stock: { gte: 3 } },
        data: { stock: { decrement: 3 } },
      });
      expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: "cart-uuid" },
      });
      expect(checkCustomerSpy).toHaveBeenCalled();
      expect(checkItemsSpy).toHaveBeenCalled();
      expect(findAndFormatOrdersSpy).toHaveBeenCalled();
      expect(result).toEqual([{ ...createdOrder, subtotal: 80, total: 280 }]);
    });

    it("should throw INACTIVE_CUSTOMER when the customer is null (treated as inactive)", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.INACTIVE_CUSTOMER,
        message:
          "Sua conta foi bloqueada. Por favor, entre em contato com o suporte.",
        httpStatus: AppException.HttpStatus.FORBIDDEN,
      });

      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw INACTIVE_CUSTOMER when the customer is inactive", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(
        buildCustomer([], { isActive: false }),
      );

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.INACTIVE_CUSTOMER,
        message:
          "Sua conta foi bloqueada. Por favor, entre em contato com o suporte.",
        httpStatus: AppException.HttpStatus.FORBIDDEN,
      });

      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw CUSTOMER_NOT_INITIALIZED when the customer has no name", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(
        buildCustomer([], { name: null }),
      );

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        message: "Cliente não inicializado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw CART_EMPTY when the cart has no items", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(buildCustomer([]));

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.CART_EMPTY,
        message: "O carrinho está vazio",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw ONGOING_ORDER when there is an ongoing order", async () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ stock: 20 }),
          quantity: 1,
        }),
      ];
      prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "200", isActive: true },
      ]);
      prismaMock.order.count.mockResolvedValue(1);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ONGOING_ORDER,
        message: "Você já tem um pedido em andamento.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: {
          customerId,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.DELIVERED] },
        },
      });
      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    describe("stock validation", () => {
      beforeEach(() => {
        prismaMock.order.count.mockResolvedValue(0);
      });

      it("should throw PRODUCTS_OUT_OF_STOCK when the product is out of stock", async () => {
        const product = ProductFactory.createOne({ name: "Cerveja", stock: 0 });
        const items = [CartItemFactory.createOne({ product, quantity: 1 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          message:
            "Cerveja está sem estoque no momento. Remova o produto para finalizar o pedido.",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw PRODUCT_INACTIVE when the product is inactive", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stock: 20,
          isActive: false,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 1 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.PRODUCT_INACTIVE,
          message:
            "Cerveja não está mais disponível. Remova o produto para finalizar o pedido.",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });
        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw the plural low-stock message when stock is 10 or less", async () => {
        const product = ProductFactory.createOne({ name: "Cerveja", stock: 5 });
        const items = [CartItemFactory.createOne({ product, quantity: 6 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          message: "Cerveja tem apenas 5 unidades restantes.",
        });
      });

      it("should throw the singular low-stock message when only one unit remains", async () => {
        const product = ProductFactory.createOne({ name: "Cerveja", stock: 1 });
        const items = [CartItemFactory.createOne({ product, quantity: 2 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          message: "Cerveja tem apenas 1 unidade restante.",
        });
      });

      it("should throw the insufficient-stock message when stock is above 10 but quantity exceeds it", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stock: 11,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 12 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          message:
            "Cerveja não tem estoque suficiente para a quantidade solicitada.",
        });
      });
    });
  });

  describe("getOrders", () => {
    it("should return the orders with computed subtotal and total", async () => {
      const findAndFormatOrdersSpy = jest.spyOn(
        service as any,
        "findAndFormatOrders",
      );
      const order = {
        id: "order-uuid",
        orderNumber: 1000,
        deliveryFee: 200,
        items: [
          { price: 10, quantity: 2 },
          { price: 20, quantity: 1 },
        ],
      };
      prismaMock.order.findMany.mockResolvedValue([order]);

      const result = await service.getOrders(customerId);

      expect(findAndFormatOrdersSpy).toHaveBeenCalled();
      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual([{ ...order, subtotal: 40, total: 240 }]);
    });

    it("should not query the customer before returning the orders", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.getOrders(customerId);

      expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("cancelOrder", () => {
    const dto = { orderId: "order-uuid" };

    it("should cancel the order, restore stock, set the status to CANCELLED and return the orders", async () => {
      const findAndFormatOrdersSpy = jest.spyOn(
        service as any,
        "findAndFormatOrders",
      );
      const order = {
        id: "order-uuid",
        status: OrderStatus.PENDING,
        items: [
          { productId: "product-1", quantity: 2 },
          { productId: "product-2", quantity: 3 },
        ],
      };
      prismaMock.order.findFirst.mockResolvedValue(order);
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await service.cancelOrder(customerId, dto);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: "order-uuid", customerId },
        include: { items: true },
      });
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: "order-uuid",
          status: OrderStatus.PENDING,
        },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: "product-1" },
        data: { stock: { increment: 2 } },
      });
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: "product-2" },
        data: { stock: { increment: 3 } },
      });
      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      expect(findAndFormatOrdersSpy).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should throw ORDER_NOT_FOUND when the order does not exist", async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(service.cancelOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ORDER_NOT_FOUND,
        message: "Pedido não encontrado",
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])("should throw ORDER_NOT_CANCELLABLE when the status is %s", async (status) => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: "order-uuid",
        status,
        items: [],
      });
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ORDER_NOT_CANCELLABLE,
        message: "Este pedido não pode mais ser cancelado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });
  });

  describe("findAndFormatOrders (private)", () => {
    it("should query the customer orders and compute subtotal and total", async () => {
      const order = {
        id: "order-uuid",
        orderNumber: 1000,
        deliveryFee: 200,
        items: [
          { price: 10, quantity: 2 },
          { price: 20, quantity: 1 },
        ],
      };
      prismaMock.order.findMany.mockResolvedValue([order]);

      const result = await (service as any).findAndFormatOrders(customerId);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual([{ ...order, subtotal: 40, total: 240 }]);
    });

    it("should return an empty array when the customer has no orders", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await (service as any).findAndFormatOrders(customerId);

      expect(result).toEqual([]);
    });
  });

  describe("checkIfCustomerIsAptToCreateOrder (private)", () => {
    const buildItems = () => [
      CartItemFactory.createOne({
        product: ProductFactory.createOne({ stock: 20 }),
        quantity: 1,
      }),
    ];

    it("should not throw when the customer has a name and items", () => {
      expect(() =>
        (service as any).checkIfCustomerIsAptToCreateOrder(
          buildCustomer(buildItems()),
        ),
      ).not.toThrow();
    });

    it("should throw INACTIVE_CUSTOMER when the customer is null", () => {
      expect(() =>
        (service as any).checkIfCustomerIsAptToCreateOrder(null),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.INACTIVE_CUSTOMER,
          message:
            "Sua conta foi bloqueada. Por favor, entre em contato com o suporte.",
          httpStatus: AppException.HttpStatus.FORBIDDEN,
        }),
      );
    });

    it("should throw INACTIVE_CUSTOMER when the customer is inactive", () => {
      expect(() =>
        (service as any).checkIfCustomerIsAptToCreateOrder(
          buildCustomer(buildItems(), { isActive: false }),
        ),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.INACTIVE_CUSTOMER,
        }),
      );
    });

    it("should throw CUSTOMER_NOT_INITIALIZED when the customer has no name", () => {
      expect(() =>
        (service as any).checkIfCustomerIsAptToCreateOrder(
          buildCustomer(buildItems(), { name: null }),
        ),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        }),
      );
    });

    it("should throw CART_EMPTY when the cart has no items", () => {
      expect(() =>
        (service as any).checkIfCustomerIsAptToCreateOrder(buildCustomer([])),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.CART_EMPTY,
          message: "O carrinho está vazio",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        }),
      );
    });
  });

  describe("checkIfThereAreInvalidItemsInCart (private)", () => {
    it("should not throw when every item is active and within stock", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ stock: 20, isActive: true }),
          quantity: 2,
        }),
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ stock: 50, isActive: true }),
          quantity: 5,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).not.toThrow();
    });

    it("should throw PRODUCT_INACTIVE when a product is inactive", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({
            name: "Cerveja",
            stock: 20,
            isActive: false,
          }),
          quantity: 1,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.PRODUCT_INACTIVE,
          message:
            "Cerveja não está mais disponível. Remova o produto para finalizar o pedido.",
        }),
      );
    });

    it("should throw PRODUCTS_OUT_OF_STOCK when a product is out of stock", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ name: "Cerveja", stock: 0 }),
          quantity: 1,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          message:
            "Cerveja está sem estoque no momento. Remova o produto para finalizar o pedido.",
        }),
      );
    });

    it("should throw the plural low-stock message when stock is 10 or less", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ name: "Cerveja", stock: 5 }),
          quantity: 6,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).toThrow(
        expect.objectContaining({
          message: "Cerveja tem apenas 5 unidades restantes.",
        }),
      );
    });

    it("should throw the singular low-stock message when only one unit remains", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ name: "Cerveja", stock: 1 }),
          quantity: 2,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).toThrow(
        expect.objectContaining({
          message: "Cerveja tem apenas 1 unidade restante.",
        }),
      );
    });

    it("should throw the insufficient-stock message when stock is above 10 but quantity exceeds it", () => {
      const items = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ name: "Cerveja", stock: 11 }),
          quantity: 12,
        }),
      ];

      expect(() =>
        (service as any).checkIfThereAreInvalidItemsInCart(items),
      ).toThrow(
        expect.objectContaining({
          message:
            "Cerveja não tem estoque suficiente para a quantidade solicitada.",
        }),
      );
    });
  });
});
