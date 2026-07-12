/** biome-ignore-all lint/suspicious/noExplicitAny: <any is necessary to spy private methods> */
import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "../cart.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import {
  couponsServiceMock,
  prismaMock,
  settingsServiceMock,
} from "@shared/testing/mocks";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CartFactory,
  CartItemFactory,
  AnonymousCustomerFactory,
  CouponFactory,
  ProductFactory,
  CustomerFactory,
} from "@shared/testing/factories";
import { SettingsService } from "../../settings/settings.service";
import {
  CouponsService,
  WELCOME_COUPON_CODE,
} from "../../coupons/coupons.service";

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
        { provide: CouponsService, useValue: couponsServiceMock },
      ],
    }).compile();

    service = module.get<CartService>(CartService);

    couponsServiceMock.isCustomerEligibleForWelcomeCoupon.mockResolvedValue(
      false,
    );

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
          cart: { items: [], couponId: null, coupon: null },
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
          cart: { items: [], couponId: null, coupon: null },
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

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

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
        remainingToMinOrderValue: 0,
        outsideBusinessHours: null,
        onBreak: null,
        deliveryFee: 200,
        subtotal,
        productsCount,
        discount: 0,
        couponCode: WELCOME_COUPON_CODE,
        isWelcomeCoupon: true,
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

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

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

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

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

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

      expect(result.products[0].remainingStock).toBe(0);
    });

    it("should expose minOrderValue, outsideBusinessHours and onBreak from settings", async () => {
      settingsServiceMock.findAll.mockResolvedValue({
        DELIVERY_FEE: "200",
        MIN_ORDER_VALUE: "5000",
        OUTSIDE_BUSINESS_HOURS: "Estamos fechados no momento.",
        ON_BREAK: "Estamos temporariamente fechados. Voltaremos em breve!",
      });

      const result = await (service as any).formatCart({
        items: [],
        coupon: null,
      });

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

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

      expect(result.products[0].remainingStock).toBe(5);
      expect(result.products[1].remainingStock).toBeNull();
    });

    it("should zero out deliveryFee, total and remainingToMinOrderValue when cart is empty", async () => {
      settingsServiceMock.findAll.mockResolvedValue({
        DELIVERY_FEE: "200",
        MIN_ORDER_VALUE: "5000",
      });

      const result = await (service as any).formatCart({
        items: [],
        coupon: null,
      });

      expect(result.deliveryFee).toBe(0);
      expect(result.total).toBe(0);
      expect(result.remainingToMinOrderValue).toBe(0);
    });

    it("should report remainingToMinOrderValue when total is below minOrderValue", async () => {
      settingsServiceMock.findAll.mockResolvedValue({
        DELIVERY_FEE: "200",
        MIN_ORDER_VALUE: "5000",
      });
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 1000, stockQuantity: 20 }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon: null,
      });

      // subtotal 1000 + deliveryFee 200 = 1200 total; minOrderValue 5000
      expect(result.remainingToMinOrderValue).toBe(3800);
    });

    it("should include couponCode and subtract the discount from the total when a coupon is applied", async () => {
      const coupon = CouponFactory.createOne({ code: "PROMO10" });
      couponsServiceMock.calculateDiscount.mockReturnValue(500);
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 5000, stockQuantity: 20 }),
          quantity: 1,
        }),
      ];

      const result = await (service as any).formatCart({
        items: cartItems,
        coupon,
      });

      expect(couponsServiceMock.calculateDiscount).toHaveBeenCalledWith(
        coupon,
        5000,
      );
      expect(result.couponCode).toBe("PROMO10");
      expect(result.discount).toBe(500);
      expect(result.total).toBe(5000 + 200 - 500);
    });

    it("should not call calculateDiscount when the cart has no coupon", async () => {
      const cartItems = [
        CartItemFactory.createOne({
          product: ProductFactory.createOne({ price: 5000, stockQuantity: 20 }),
          quantity: 1,
        }),
      ];

      await (service as any).formatCart({ items: cartItems, coupon: null });

      expect(couponsServiceMock.calculateDiscount).not.toHaveBeenCalled();
    });

    describe("welcome coupon", () => {
      const customerId = "customer-123";

      it("should apply the welcome discount when the customer is eligible and has no coupon assigned", async () => {
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 5000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.isCustomerEligibleForWelcomeCoupon.mockResolvedValue(
          true,
        );
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(500);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon: null },
          { customerId },
        );

        expect(
          couponsServiceMock.isCustomerEligibleForWelcomeCoupon,
        ).toHaveBeenCalledWith(customerId);
        expect(result.isWelcomeCoupon).toBe(true);
        expect(result.couponCode).toBe(WELCOME_COUPON_CODE);
        expect(result.discount).toBe(500);
        expect(result.total).toBe(5000 + 200 - 500);
      });

      it("should report isWelcomeCoupon true with zero discount when the welcome discount computes to zero", async () => {
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 100,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.isCustomerEligibleForWelcomeCoupon.mockResolvedValue(
          true,
        );
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(0);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon: null },
          { customerId },
        );

        expect(result.isWelcomeCoupon).toBe(true);
        expect(result.discount).toBe(0);
        expect(result.couponCode).toBe(WELCOME_COUPON_CODE);
      });

      it("should not check welcome coupon eligibility when the cart already has a coupon assigned", async () => {
        const coupon = CouponFactory.createOne({ code: "PROMO10" });
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 5000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.calculateDiscount.mockReturnValue(500);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon },
          { customerId },
        );

        expect(
          couponsServiceMock.isCustomerEligibleForWelcomeCoupon,
        ).not.toHaveBeenCalled();
        expect(result.isWelcomeCoupon).toBe(false);
        expect(result.couponCode).toBe("PROMO10");
      });

      it("should not report the welcome coupon when the authenticated customer is not eligible", async () => {
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 5000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.isCustomerEligibleForWelcomeCoupon.mockResolvedValue(
          false,
        );

        const result = await (service as any).formatCart(
          { items: cartItems, coupon: null },
          { customerId },
        );

        expect(
          couponsServiceMock.isCustomerEligibleForWelcomeCoupon,
        ).toHaveBeenCalledWith(customerId);
        expect(
          couponsServiceMock.calculateWelcomeDiscount,
        ).not.toHaveBeenCalled();
        expect(result.isWelcomeCoupon).toBe(false);
        expect(result.couponCode).toBeNull();
        expect(result.discount).toBe(0);
      });

      it("should treat an anonymous session as eligible without querying the database", async () => {
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 5000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(500);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon: null },
          { deviceId: "device-123" },
        );

        expect(
          couponsServiceMock.isCustomerEligibleForWelcomeCoupon,
        ).not.toHaveBeenCalled();
        expect(
          couponsServiceMock.calculateWelcomeDiscount,
        ).toHaveBeenCalledWith(5000, expect.anything());
        expect(result.isWelcomeCoupon).toBe(true);
        expect(result.couponCode).toBe(WELCOME_COUPON_CODE);
        expect(result.discount).toBe(500);
      });

      it("should not report the welcome coupon when an anonymous cart already has a real coupon", async () => {
        const coupon = CouponFactory.createOne({ code: "PROMO10" });
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 5000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.calculateDiscount.mockReturnValue(500);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon },
          { deviceId: "device-123" },
        );

        expect(
          couponsServiceMock.isCustomerEligibleForWelcomeCoupon,
        ).not.toHaveBeenCalled();
        expect(
          couponsServiceMock.calculateWelcomeDiscount,
        ).not.toHaveBeenCalled();
        expect(result.isWelcomeCoupon).toBe(false);
        expect(result.couponCode).toBe("PROMO10");
        expect(result.discount).toBe(500);
      });

      it("should compute remainingToMinOrderValue against the total after the welcome discount", async () => {
        settingsServiceMock.findAll.mockResolvedValue({
          DELIVERY_FEE: "200",
          MIN_ORDER_VALUE: "5000",
        });
        const cartItems = [
          CartItemFactory.createOne({
            product: ProductFactory.createOne({
              price: 3000,
              stockQuantity: 20,
            }),
            quantity: 1,
          }),
        ];
        couponsServiceMock.isCustomerEligibleForWelcomeCoupon.mockResolvedValue(
          true,
        );
        couponsServiceMock.calculateWelcomeDiscount.mockResolvedValue(1000);

        const result = await (service as any).formatCart(
          { items: cartItems, coupon: null },
          { customerId },
        );

        // subtotal 3000 + deliveryFee 200 - discount 1000 = 2200 total; minOrderValue 5000
        expect(result.remainingToMinOrderValue).toBe(2800);
      });
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
              coupon: true,
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
              coupon: true,
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
              coupon: true,
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
      expect(formatCartSpy).toHaveBeenCalledWith(cart, {
        deviceId: "device-123",
      });
    });

    it("should call findAnonymousOrCustomerWithCartOrThrow and formatCart with customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        cart,
      });

      await service.getCart({ customerId: "customer-123" });

      expect(findAnonymousOrCustomerWithCartOrThrow).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
      expect(formatCartSpy).toHaveBeenCalledWith(cart, {
        customerId: "customer-123",
      });
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
            select: expect.objectContaining({
              coupon: true,
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

  describe("assignCouponToCart", () => {
    const customerId = "customer-123";
    const couponCode = "PROMO10";

    beforeEach(() => {
      settingsServiceMock.findAll.mockResolvedValue({ DELIVERY_FEE: "0" });
      couponsServiceMock.isCouponUnavailable.mockReturnValue(false);
      couponsServiceMock.hasReachedUsageLimit.mockResolvedValue(false);
      couponsServiceMock.hasCustomerUsedCoupon.mockResolvedValue(false);
    });

    it("should throw COUPON_REQUIRES_AUTH when session has no customerId", async () => {
      await expect(
        service.assignCouponToCart({ deviceId: "device-123" }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_REQUIRES_AUTH,
        message: "Faça login para utilizar um cupom",
        httpStatus: AppException.HttpStatus.UNAUTHORIZED,
      });

      expect(findAnonymousOrCustomerWithCartOrThrow).not.toHaveBeenCalled();
      expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
    });

    it("should throw COUPON_NOT_FOUND when the coupon code does not exist", async () => {
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({ items: [] }),
      });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.assignCouponToCart({ customerId }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_NOT_FOUND,
        message: "Cupom indisponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw COUPON_UNAVAILABLE when the coupon is not currently redeemable", async () => {
      const coupon = CouponFactory.createOne({ code: couponCode });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({ items: [] }),
      });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(coupon);
      couponsServiceMock.isCouponUnavailable.mockReturnValue(true);

      await expect(
        service.assignCouponToCart({ customerId }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_UNAVAILABLE,
        message: "Cupom indisponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw COUPON_MIN_ORDER_NOT_MET when the cart subtotal is below the coupon's minOrderValue", async () => {
      const coupon = CouponFactory.createOne({
        code: couponCode,
        minOrderValue: 10000,
      });
      const product = ProductFactory.createOne({
        price: 100,
        stockQuantity: 20,
      });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({
          items: [CartItemFactory.createOne({ product, quantity: 1 })],
        }),
      });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(coupon);

      await expect(
        service.assignCouponToCart({ customerId }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_MIN_ORDER_NOT_MET,
        message: "O valor do carrinho não atinge o mínimo para este cupom",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });
    });

    it("should throw COUPON_USAGE_LIMIT_REACHED when the coupon's global usage limit was reached", async () => {
      const coupon = CouponFactory.createOne({
        code: couponCode,
        usageLimit: 5,
      });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({ items: [] }),
      });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(coupon);
      couponsServiceMock.hasReachedUsageLimit.mockResolvedValue(true);

      await expect(
        service.assignCouponToCart({ customerId }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_USAGE_LIMIT_REACHED,
        message: "Cupom indisponível",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(couponsServiceMock.hasReachedUsageLimit).toHaveBeenCalledWith(
        coupon.id,
        coupon.usageLimit,
      );
    });

    it("should throw COUPON_ALREADY_USED when the customer already redeemed this coupon", async () => {
      const coupon = CouponFactory.createOne({ code: couponCode });
      const customer = CustomerFactory.createOne({
        cart: CartFactory.createOne({ items: [] }),
      });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(coupon);
      couponsServiceMock.hasCustomerUsedCoupon.mockResolvedValue(true);

      await expect(
        service.assignCouponToCart({ customerId }, { couponCode }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.cart.COUPON_ALREADY_USED,
        message: "Você já utilizou este cupom",
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(couponsServiceMock.hasCustomerUsedCoupon).toHaveBeenCalledWith(
        coupon.id,
        customerId,
      );
    });

    it("should assign the coupon to the cart when every rule passes", async () => {
      const coupon = CouponFactory.createOne({ code: couponCode });
      const cart = CartFactory.createOne({ items: [] });
      const customer = CustomerFactory.createOne({ cart });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.coupon.findUnique.mockResolvedValue(coupon);
      prismaMock.cart.update.mockResolvedValue({
        items: [],
        coupon,
      });

      await service.assignCouponToCart({ customerId }, { couponCode });

      expect(prismaMock.cart.update).toHaveBeenCalledWith({
        where: { id: cart.id },
        data: { couponId: coupon.id },
        select: {
          items: {
            include: {
              product: true,
            },
          },
          coupon: true,
        },
      });
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("removeCouponFromCart", () => {
    describe.each(sessionCases)("$label", ({ session, mockEmptyCart }) => {
      it("should throw COUPON_NOT_ASSIGNED when the cart has no coupon applied", async () => {
        mockEmptyCart();

        await expect(
          service.removeCouponFromCart(session),
        ).rejects.toMatchObject({
          code: AppException.errorCodes.cart.COUPON_NOT_ASSIGNED,
          message: "Nenhum cupom aplicado ao carrinho",
          httpStatus: AppException.HttpStatus.BAD_REQUEST,
        });

        expect(prismaMock.cart.update).not.toHaveBeenCalled();
      });
    });

    it("should clear the couponId when a coupon is applied", async () => {
      const coupon = CouponFactory.createOne();
      const cart = CartFactory.createOne({ items: [], coupon });
      const customer = CustomerFactory.createOne({ cart });
      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.cart.update.mockResolvedValue({ items: [], coupon: null });

      await service.removeCouponFromCart({ customerId: customer.id });

      expect(prismaMock.cart.update).toHaveBeenCalledWith({
        where: { id: cart.id },
        data: { couponId: null },
        select: {
          items: {
            include: {
              product: true,
            },
          },
          coupon: true,
        },
      });
      expect(formatCartSpy).toHaveBeenCalledTimes(1);
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
