/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to access private methods> */
import { Test, TestingModule } from "@nestjs/testing";
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

    it("should create the order, decrement stock and clear the cart", async () => {
      const findCustomerOrThrowSpy = jest.spyOn(
        service as any,
        "findCustomerOrThrow",
      );

      const product1 = ProductFactory.createOne({ price: 10, stock: 20 });
      const product2 = ProductFactory.createOne({ price: 20, stock: 30 });
      const items = [
        CartItemFactory.createOne({ product: product1, quantity: 2 }),
        CartItemFactory.createOne({ product: product2, quantity: 3 }),
      ];
      const customer = buildCustomer(items);

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.setting.findUnique.mockResolvedValue({ value: "200" });

      await service.createOrder(customerId, dto);

      expect(findCustomerOrThrowSpy).toHaveBeenCalledWith(customerId);
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
      expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: product1.id },
        data: { stock: { decrement: 2 } },
      });
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: product2.id },
        data: { stock: { decrement: 3 } },
      });
      expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: "cart-uuid" },
      });
    });

    it("should throw CART_EMPTY when the cart has no items", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(buildCustomer([]));

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
      prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));
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
        prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));

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
        prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));

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
        prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          message:
            "Cerveja tem apenas 5 unidades restantes. Reduza a quantidade para finalizar o pedido.",
        });
      });

      it("should throw the singular low-stock message when only one unit remains", async () => {
        const product = ProductFactory.createOne({ name: "Cerveja", stock: 1 });
        const items = [CartItemFactory.createOne({ product, quantity: 2 })];
        prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          message:
            "Cerveja tem apenas 1 unidade restante. Reduza a quantidade para finalizar o pedido.",
        });
      });

      it("should throw the insufficient-stock message when stock is above 10 but quantity exceeds it", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stock: 11,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 12 })];
        prismaMock.customer.findUnique.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          message:
            "Cerveja não tem estoque suficiente para a quantidade solicitada. Reduza a quantidade para finalizar o pedido.",
        });
      });
    });
  });

  describe("getOrders", () => {
    it("should return the orders with computed subtotal and total", async () => {
      const findCustomerOrThrowSpy = jest.spyOn(
        service as any,
        "findCustomerOrThrow",
      );
      prismaMock.customer.findUnique.mockResolvedValue(buildCustomer([]));

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

      expect(findCustomerOrThrowSpy).toHaveBeenCalledWith(customerId);
      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual([{ ...order, subtotal: 40, total: 240 }]);
    });

    it("should propagate CUSTOMER_NOT_FOUND from findCustomerOrThrow", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(service.getOrders(customerId)).rejects.toMatchObject({
        code: AppException.errorCodes.order.CUSTOMER_NOT_FOUND,
      });

      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe("cancelOrder", () => {
    const dto = { orderId: "order-uuid" };

    it("should cancel the order, restore stock and set the status to CANCELLED", async () => {
      const order = {
        id: "order-uuid",
        status: OrderStatus.PENDING,
        items: [
          { productId: "product-1", quantity: 2 },
          { productId: "product-2", quantity: 3 },
        ],
      };
      prismaMock.order.findFirst.mockResolvedValue(order);

      await service.cancelOrder(customerId, dto);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: "order-uuid", customerId },
        include: { items: true },
      });
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: "order-uuid" },
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
    });

    it("should cancel the order when its status is PREPARING", async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: "order-uuid",
        status: OrderStatus.PREPARING,
        items: [],
      });

      await service.cancelOrder(customerId, dto);

      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: "order-uuid" },
        data: { status: OrderStatus.CANCELLED },
      });
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

      await expect(service.cancelOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ORDER_NOT_CANCELLABLE,
        message: "Este pedido não pode mais ser cancelado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.update).not.toHaveBeenCalled();
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });
  });

  describe("findCustomerOrThrow", () => {
    it("should query the customer with addresses and cart, and return it", async () => {
      const customer = buildCustomer([]);
      prismaMock.customer.findUnique.mockResolvedValue(customer);

      const result = await (service as any).findCustomerOrThrow(customerId);

      expect(result).toEqual(customer);
      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith({
        where: { id: customerId, isActive: true },
        include: {
          addresses: true,
          cart: { include: { items: { include: { product: true } } } },
        },
      });
    });

    it("should throw CUSTOMER_NOT_FOUND when the customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).findCustomerOrThrow(customerId),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.order.CUSTOMER_NOT_FOUND,
        message: "Cliente não encontrado",
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });
    });

    it("should throw CUSTOMER_NOT_INITIALIZED when the customer has no name", async () => {
      const customer = CustomerFactory.createOne({
        id: customerId,
        name: null,
        addresses: [AddressFactory.createOne({ customerId })],
      });
      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        (service as any).findCustomerOrThrow(customerId),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        message: "Cliente não inicializado",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw CUSTOMER_NOT_INITIALIZED when the customer has no addresses", async () => {
      const customer = CustomerFactory.createOne({
        id: customerId,
        name: "João da Silva",
        addresses: [],
      });
      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        (service as any).findCustomerOrThrow(customerId),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
      });
    });
  });
});
