/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to access private methods> */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Test, TestingModule } from "@nestjs/testing";
import { SettingKey } from "@shared/database/prisma/generated/client";
import {
  InventoryMovementOrigin,
  OrderStatus,
  PaymentType,
} from "@shared/database/prisma/generated/enums";
import { Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { OrderCancelledEvent, OrderCreatedEvent } from "@shared/events/order";
import { AppException } from "@shared/exceptions/app.exception";
import {
  AddressFactory,
  CartFactory,
  CartItemFactory,
  CouponFactory,
  CustomerFactory,
  ProductFactory,
} from "@shared/testing/factories";
import { couponsServiceMock, prismaMock } from "@shared/testing/mocks";
import { OrdersService } from "../orders.service";
import {
  CouponsService,
  WELCOME_COUPON_CODE,
} from "../../coupons/coupons.service";
import { SettingsService } from "../../settings/settings.service";

const customerId = "customer-uuid";

const eventEmitterMock = { emit: jest.fn() };

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
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: CouponsService, useValue: couponsServiceMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);

    couponsServiceMock.isCouponUnavailable.mockReturnValue(false);
    couponsServiceMock.hasReachedUsageLimit.mockResolvedValue(false);
    couponsServiceMock.hasCustomerUsedCoupon.mockResolvedValue(false);
    couponsServiceMock.calculateDiscount.mockReturnValue(0);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createOrder", () => {
    const dto = { paymentType: PaymentType.CASH };

    it("should create the order, decrement stockQuantity, clear the cart and return the orders", async () => {
      const assertCustomerSpy = jest.spyOn(
        service as any,
        "assertCustomerIsAptToCreateOrder",
      );
      const assertItemsSpy = jest.spyOn(
        service as any,
        "assertThereAreInvalidItemsInCart",
      );
      const findAndFormatOrdersSpy = jest.spyOn(
        service as any,
        "findAndFormatOrders",
      );

      const product1 = ProductFactory.createOne({
        price: 10,
        stockQuantity: 20,
      });
      const product2 = ProductFactory.createOne({
        price: 20,
        stockQuantity: 30,
      });
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
        customerId,
        orderNumber: 1000,
        status: OrderStatus.PENDING,
        statusReason: null,
        deliveryFee: 200,
        couponId: null,
        couponCode: null,
        discount: 0,
        items: [
          { price: 10, quantity: 2, productId: product1.id },
          { price: 20, quantity: 3, productId: product2.id },
        ],
      };
      prismaMock.order.create.mockResolvedValue(createdOrder);
      prismaMock.order.findMany.mockResolvedValue([createdOrder]);

      const result = await service.createOrder(customerId, dto);

      expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
        where: { id: customerId },
        include: {
          addresses: true,
          cart: {
            include: { items: { include: { product: true } }, coupon: true },
          },
        },
      });
      expect(prismaMock.order.create).toHaveBeenCalledWith({
        data: {
          customerId: customer.id,
          address: "Rua A, 100 - Centro/12345678",
          status: OrderStatus.PENDING,
          deliveryFee: 200,
          couponId: null,
          couponCode: null,
          discount: 0,
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
        include: {
          items: true,
        },
      });
      expect(prismaMock.product.updateMany).toHaveBeenCalledTimes(2);
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: product1.id, stockQuantity: { gte: 2 } },
        data: { stockQuantity: { decrement: 2 } },
      });
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: product2.id, stockQuantity: { gte: 3 } },
        data: { stockQuantity: { decrement: 3 } },
      });
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.couponUsage.create).not.toHaveBeenCalled();
      expect(prismaMock.cart.update).toHaveBeenCalledWith({
        where: { id: "cart-uuid" },
        data: { couponId: null, items: { deleteMany: {} } },
      });
      expect(assertCustomerSpy).toHaveBeenCalled();
      expect(assertItemsSpy).toHaveBeenCalled();
      expect(findAndFormatOrdersSpy).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        OrderCreatedEvent.NAME,
        new OrderCreatedEvent({ order: createdOrder }),
      );
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
          product: ProductFactory.createOne({ stockQuantity: 20 }),
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

    it("should throw ON_BREAK and fail fast when the store is on break", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        {
          key: SettingKey.ON_BREAK,
          value: "Estamos temporariamente fechados. Voltaremos em breve!",
          isActive: true,
        },
      ]);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ON_BREAK,
        message: "Estamos temporariamente fechados. Voltaremos em breve!",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw ON_BREAK before OUTSIDE_BUSINESS_HOURS when both are active", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        {
          key: SettingKey.ON_BREAK,
          value: "Estamos temporariamente fechados. Voltaremos em breve!",
          isActive: true,
        },
        {
          key: SettingKey.OUTSIDE_BUSINESS_HOURS,
          value: "Estamos fechados no momento.",
          isActive: true,
        },
      ]);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ON_BREAK,
        message: "Estamos temporariamente fechados. Voltaremos em breve!",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    });

    it("should throw OUTSIDE_BUSINESS_HOURS and fail fast when the store is closed", async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        {
          key: SettingKey.OUTSIDE_BUSINESS_HOURS,
          value: "Estamos fechados no momento.",
          isActive: true,
        },
      ]);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.OUTSIDE_BUSINESS_HOURS,
        message: "Estamos fechados no momento.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    it("should throw BELOW_MIN_ORDER_VALUE when the order total does not meet the minimum", async () => {
      const product = ProductFactory.createOne({
        price: 1000,
        stockQuantity: 20,
      });
      const items = [CartItemFactory.createOne({ product, quantity: 2 })];
      prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.setting.findMany.mockResolvedValue([
        { key: SettingKey.DELIVERY_FEE, value: "500", isActive: true },
        { key: SettingKey.MIN_ORDER_VALUE, value: "3000", isActive: true },
      ]);

      await expect(service.createOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.BELOW_MIN_ORDER_VALUE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.order.create).not.toHaveBeenCalled();
    });

    describe("with a coupon applied", () => {
      const buildCustomerWithCoupon = (items: any[], coupon: any) =>
        buildCustomer(items, {
          cart: CartFactory.createOne({ id: "cart-uuid", items, coupon }),
        });

      it("should apply the discount, snapshot the coupon on the order, record the usage and clear the cart's coupon", async () => {
        const product = ProductFactory.createOne({
          price: 1000,
          stockQuantity: 20,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 2 })];
        const coupon = CouponFactory.createOne({
          id: "coupon-uuid",
          code: "PROMO10",
          minOrderValue: 0,
        });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.setting.findMany.mockResolvedValue([
          { key: SettingKey.DELIVERY_FEE, value: "200", isActive: true },
        ]);
        couponsServiceMock.calculateDiscount.mockReturnValue(300);

        const createdOrder = {
          id: "order-uuid",
          customerId,
          orderNumber: 1000,
          status: OrderStatus.PENDING,
          statusReason: null,
          deliveryFee: 200,
          couponId: coupon.id,
          couponCode: coupon.code,
          discount: 300,
          items: [{ price: 1000, quantity: 2, productId: product.id }],
        };
        prismaMock.order.create.mockResolvedValue(createdOrder);
        prismaMock.order.findMany.mockResolvedValue([createdOrder]);

        const result = await service.createOrder(customerId, dto);

        expect(couponsServiceMock.calculateDiscount).toHaveBeenCalledWith(
          coupon,
          2000,
        );
        expect(prismaMock.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              couponId: coupon.id,
              couponCode: coupon.code,
              discount: 300,
            }),
          }),
        );
        expect(prismaMock.couponUsage.create).toHaveBeenCalledWith({
          data: { couponId: coupon.id, customerId },
        });
        expect(prismaMock.cart.update).toHaveBeenCalledWith({
          where: { id: "cart-uuid" },
          data: { couponId: null, items: { deleteMany: {} } },
        });
        expect(result).toEqual([
          { ...createdOrder, subtotal: 2000, total: 1900 },
        ]);
      });

      it("should throw COUPON_UNAVAILABLE before creating the order when the coupon is not currently redeemable", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({ minOrderValue: 0 });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([]);
        couponsServiceMock.isCouponUnavailable.mockReturnValue(true);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_UNAVAILABLE,
          message: "Cupom indisponível",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw COUPON_MIN_ORDER_NOT_MET when the cart subtotal is below the coupon's minimum", async () => {
        const product = ProductFactory.createOne({
          price: 100,
          stockQuantity: 20,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 1 })];
        const coupon = CouponFactory.createOne({ minOrderValue: 10000 });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([]);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_MIN_ORDER_NOT_MET,
          message: "O valor do carrinho não atinge o mínimo para este cupom",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw COUPON_USAGE_LIMIT_REACHED when the pre-check reports the global usage limit was reached", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({
          minOrderValue: 0,
          usageLimit: 5,
        });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([]);
        couponsServiceMock.hasReachedUsageLimit.mockResolvedValue(true);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_USAGE_LIMIT_REACHED,
          message: "Este cupom atingiu o limite de uso",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw COUPON_ALREADY_USED when the pre-check reports the customer already redeemed the coupon", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({ minOrderValue: 0 });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([]);
        couponsServiceMock.hasCustomerUsedCoupon.mockResolvedValue(true);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_ALREADY_USED,
          message: "Você já utilizou este cupom",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw BELOW_MIN_ORDER_VALUE when the coupon discount drops the total below the minimum", async () => {
        const product = ProductFactory.createOne({
          price: 2000,
          stockQuantity: 20,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 1 })];
        const coupon = CouponFactory.createOne({ minOrderValue: 0 });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([
          { key: SettingKey.DELIVERY_FEE, value: "0", isActive: true },
          { key: SettingKey.MIN_ORDER_VALUE, value: "1900", isActive: true },
        ]);
        // subtotal 2000 alone would meet the 1900 minimum, but the coupon discount drops the total to 1500
        couponsServiceMock.calculateDiscount.mockReturnValue(500);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.BELOW_MIN_ORDER_VALUE,
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });

      it("should throw COUPON_USAGE_LIMIT_REACHED when a concurrent request exhausts the limit inside the transaction", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({
          minOrderValue: 0,
          usageLimit: 1,
        });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.setting.findMany.mockResolvedValue([]);
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        // the pre-check passed, but a concurrent order consumed the last slot before the row lock
        prismaMock.couponUsage.count.mockResolvedValue(1);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_USAGE_LIMIT_REACHED,
          message: "Este cupom atingiu o limite de uso",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).toHaveBeenCalled();
        expect(prismaMock.couponUsage.create).not.toHaveBeenCalled();
        expect(prismaMock.cart.update).not.toHaveBeenCalled();
      });

      it("should throw COUPON_ALREADY_USED when couponUsage.create hits the unique constraint race", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({
          minOrderValue: 0,
          usageLimit: null,
        });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.setting.findMany.mockResolvedValue([]);
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        prismaMock.couponUsage.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          }),
        );

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.COUPON_ALREADY_USED,
          message: "Você já utilizou este cupom",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).toHaveBeenCalled();
        expect(prismaMock.cart.update).not.toHaveBeenCalled();
      });

      it("should rethrow an unexpected error from couponUsage.create without converting it", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        const coupon = CouponFactory.createOne({
          minOrderValue: 0,
          usageLimit: null,
        });
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomerWithCoupon(items, coupon),
        );
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.setting.findMany.mockResolvedValue([]);
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        const unexpectedError = new Error("connection lost");
        prismaMock.couponUsage.create.mockRejectedValue(unexpectedError);

        await expect(service.createOrder(customerId, dto)).rejects.toBe(
          unexpectedError,
        );
        expect(prismaMock.order.create).toHaveBeenCalled();
      });
    });

    describe("stockQuantity validation", () => {
      beforeEach(() => {
        prismaMock.order.count.mockResolvedValue(0);
      });

      it("should throw PRODUCTS_OUT_OF_STOCK when the product is out of stockQuantity", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stockQuantity: 0,
        });
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
          stockQuantity: 20,
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

      it("should throw the plural low-stock message when stockQuantity is 10 or less", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stockQuantity: 5,
        });
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
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stockQuantity: 1,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 2 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          message: "Cerveja tem apenas 1 unidade restante.",
        });
      });

      it("should throw the insufficient-stock message when stockQuantity is above 10 but quantity exceeds it", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stockQuantity: 11,
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

    describe("with the welcome coupon", () => {
      beforeEach(() => {
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.setting.findMany.mockResolvedValue([]);
      });

      it("should apply the welcome discount, snapshot its code on the order and skip couponUsage tracking", async () => {
        const product = ProductFactory.createOne({
          price: 1000,
          stockQuantity: 20,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 2 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
        couponsServiceMock.isEligibleForWelcomeCoupon.mockResolvedValue(true);
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(300);

        const createdOrder = {
          id: "order-uuid",
          customerId,
          orderNumber: 1000,
          status: OrderStatus.PENDING,
          statusReason: null,
          deliveryFee: 0,
          couponId: null,
          couponCode: WELCOME_COUPON_CODE,
          discount: 300,
          items: [{ price: 1000, quantity: 2, productId: product.id }],
        };
        prismaMock.order.create.mockResolvedValue(createdOrder);
        prismaMock.order.findMany.mockResolvedValue([createdOrder]);

        const result = await service.createOrder(customerId, dto);

        expect(prismaMock.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              couponId: null,
              couponCode: WELCOME_COUPON_CODE,
              discount: 300,
            }),
          }),
        );
        expect(prismaMock.couponUsage.create).not.toHaveBeenCalled();
        expect(result).toEqual([
          { ...createdOrder, subtotal: 2000, total: 1700 },
        ]);
      });

      it("should not snapshot a couponCode when the eligible customer's welcome discount is zero", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
        couponsServiceMock.isEligibleForWelcomeCoupon.mockResolvedValue(true);
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(0);
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        prismaMock.order.findMany.mockResolvedValue([]);

        await service.createOrder(customerId, dto);

        expect(prismaMock.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              couponCode: null,
              discount: 0,
            }),
          }),
        );
      });

      it("should not calculate the welcome discount when the customer is not eligible", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
        couponsServiceMock.isEligibleForWelcomeCoupon.mockResolvedValue(false);
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        prismaMock.order.findMany.mockResolvedValue([]);

        await service.createOrder(customerId, dto);

        expect(
          couponsServiceMock.calculateWelcomeDiscount,
        ).not.toHaveBeenCalled();
        expect(prismaMock.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              couponCode: null,
              discount: 0,
            }),
          }),
        );
      });

      it("should not check welcome coupon eligibility when the cart already has a coupon applied", async () => {
        const coupon = CouponFactory.createOne({ minOrderValue: 0 });
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        prismaMock.customer.findFirst.mockResolvedValue(
          buildCustomer(items, {
            cart: CartFactory.createOne({ id: "cart-uuid", items, coupon }),
          }),
        );
        prismaMock.order.create.mockResolvedValue({
          id: "order-uuid",
          items: [],
        });
        prismaMock.order.findMany.mockResolvedValue([]);
        prismaMock.couponUsage.create.mockResolvedValue({
          id: "usage-uuid",
          couponId: coupon.id,
          customerId,
          createdAt: new Date(),
        });

        await service.createOrder(customerId, dto);

        expect(
          couponsServiceMock.isEligibleForWelcomeCoupon,
        ).not.toHaveBeenCalled();
      });

      it("should throw WELCOME_COUPON_UNAVAILABLE when a concurrent order closes the eligibility window inside the transaction", async () => {
        const items = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({ stockQuantity: 20 }),
            quantity: 1,
          }),
        ];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
        couponsServiceMock.isEligibleForWelcomeCoupon.mockResolvedValue(true);
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(300);
        // pre-check passed (0), but a concurrent order was placed before the row lock
        prismaMock.order.count
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1);

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.WELCOME_COUPON_UNAVAILABLE,
          message: "Cupom de boas-vindas indisponível",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.order.create).not.toHaveBeenCalled();
      });
    });

    describe("concurrent stockQuantity decrement", () => {
      it("should throw PRODUCTS_OUT_OF_STOCK and skip clearing the cart when a concurrent order exhausts stockQuantity inside the transaction", async () => {
        const product = ProductFactory.createOne({
          name: "Cerveja",
          stockQuantity: 20,
        });
        const items = [CartItemFactory.createOne({ product, quantity: 1 })];
        prismaMock.customer.findFirst.mockResolvedValue(buildCustomer(items));
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.setting.findMany.mockResolvedValue([]);
        // the pre-check passed, but a concurrent order decremented stockQuantity first
        prismaMock.product.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.createOrder(customerId, dto),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          message:
            "Cerveja não tem estoque suficiente para a quantidade solicitada.",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.cart.update).not.toHaveBeenCalled();
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
        discount: 0,
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

    it("should subtract the applied coupon discount from the total", async () => {
      const order = {
        id: "order-uuid",
        orderNumber: 1000,
        deliveryFee: 200,
        discount: 500,
        couponCode: "PROMO10",
        items: [{ price: 300, quantity: 2 }],
      };
      prismaMock.order.findMany.mockResolvedValue([order]);

      const result = await service.getOrders(customerId);

      expect(result).toEqual([{ ...order, subtotal: 600, total: 300 }]);
    });

    it("should return an empty array when the customer has no orders", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await service.getOrders(customerId);

      expect(result).toEqual([]);
    });
  });

  describe("cancelOrder", () => {
    const dto = { orderId: "order-uuid" };

    it("should cancel the order, restore stockQuantity, set the status to CANCELLED and return the orders", async () => {
      const findAndFormatOrdersSpy = jest.spyOn(
        service as any,
        "findAndFormatOrders",
      );
      const order = {
        id: "order-uuid",
        customerId,
        orderNumber: 1000,
        status: OrderStatus.PENDING,
        statusReason: null,
        couponId: null,
        discount: 0,
        items: [
          { productId: "product-1", price: 10, quantity: 2 },
          { productId: "product-2", price: 20, quantity: 3 },
        ],
      };
      prismaMock.order.findFirst.mockResolvedValue(order);
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await service.cancelOrder(customerId, dto);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: "order-uuid", customerId },
        include: { items: { include: { product: true } } },
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
        data: { stockQuantity: { increment: 2 } },
      });
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: "product-2" },
        data: { stockQuantity: { increment: 3 } },
      });
      expect(prismaMock.couponUsage.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      expect(findAndFormatOrdersSpy).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        OrderCancelledEvent.NAME,
        new OrderCancelledEvent({
          order,
          origin: InventoryMovementOrigin.ORDER_CANCELLATION,
        }),
      );
      expect(result).toEqual([]);
    });

    it("should revert the coupon usage when the cancelled order has an applied coupon", async () => {
      const order = {
        id: "order-uuid",
        customerId,
        orderNumber: 1000,
        status: OrderStatus.PENDING,
        statusReason: null,
        couponId: "coupon-uuid",
        discount: 500,
        items: [{ productId: "product-1", price: 10, quantity: 2 }],
      };
      prismaMock.order.findFirst.mockResolvedValue(order);
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.findMany.mockResolvedValue([]);

      await service.cancelOrder(customerId, dto);

      expect(prismaMock.couponUsage.deleteMany).toHaveBeenCalledWith({
        where: { couponId: "coupon-uuid", customerId },
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
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelOrder(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.order.ORDER_NOT_CANCELLABLE,
        message: "Este pedido não pode mais ser cancelado.",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });
  });

  describe("assertOrderMeetsMinValue (private)", () => {
    it("should not throw when the minimum value setting is absent or zero", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(1000, 0, {}),
      ).not.toThrow();
      expect(() =>
        (service as any).assertOrderMeetsMinValue(1000, 0, {
          MIN_ORDER_VALUE: "0",
        }),
      ).not.toThrow();
    });

    it("should not throw when the subtotal alone meets the minimum", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(2000, 0, {
          MIN_ORDER_VALUE: "2000",
        }),
      ).not.toThrow();
    });

    it("should not throw when the delivery fee pushes the total to the minimum", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(2000, 0, {
          MIN_ORDER_VALUE: "2500",
          DELIVERY_FEE: "500",
        }),
      ).not.toThrow();
    });

    it("should not throw when subtotal and delivery fee still cover the minimum after the discount", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(2500, 500, {
          MIN_ORDER_VALUE: "2200",
          DELIVERY_FEE: "200",
        }),
      ).not.toThrow();
    });

    it("should throw BELOW_MIN_ORDER_VALUE when subtotal plus delivery fee is below the minimum", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(1000, 0, {
          MIN_ORDER_VALUE: "3000",
          DELIVERY_FEE: "200",
        }),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.BELOW_MIN_ORDER_VALUE,
          message: "O valor mínimo para realizar um pedido é de R$ 30,00.",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it("should throw BELOW_MIN_ORDER_VALUE when the coupon discount drops the total below the minimum", () => {
      expect(() =>
        (service as any).assertOrderMeetsMinValue(2000, 500, {
          MIN_ORDER_VALUE: "2000",
        }),
      ).toThrow(
        expect.objectContaining({
          code: AppException.errorCodes.order.BELOW_MIN_ORDER_VALUE,
        }),
      );
    });
  });
});
