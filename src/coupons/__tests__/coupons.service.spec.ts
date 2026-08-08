import { Test, TestingModule } from "@nestjs/testing";
import { CouponsService } from "../coupons.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  OrderStatus,
  SettingKey,
} from "@shared/database/prisma/generated/client";
import { prismaMock } from "@shared/testing/mocks";
import { CouponFactory } from "@shared/testing/factories";

describe("CouponsService", () => {
  let service: CouponsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAvailableCoupons", () => {
    const customerId = "customer-1";
    const now = new Date("2026-07-09T12:00:00.000Z");
    const visibilityLimit = new Date("2026-07-02T12:00:00.000Z");

    const limitReachedDates = new Map<string, Date>();

    const buildCoupon = (
      usageLimit: number | null,
      usageCount: number,
      options?: {
        limitReachedAt?: Date;
        endsAt?: Date | null;
        usedByCustomer?: boolean;
      },
    ) => {
      const coupon = CouponFactory.createOne({
        usageLimit,
        endsAt: options?.endsAt,
      });

      limitReachedDates.set(coupon.id, options?.limitReachedAt ?? now);

      return {
        ...coupon,
        _count: { usages: usageCount },
        usages: options?.usedByCustomer ? [{ id: "usage-1" }] : [],
      };
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
      limitReachedDates.clear();

      prismaMock.cart.findUnique.mockResolvedValue(null);

      prismaMock.couponUsage.findFirst.mockImplementation(({ where }) => {
        const createdAt = limitReachedDates.get(where.couponId);

        return Promise.resolve(createdAt ? { createdAt } : null);
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should query active and started coupons, keeping the ones expired within the visibility window, and flag the customer's own usage", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([]);

      await service.findAvailableCoupons(customerId);

      expect(prismaMock.coupon.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          startsAt: { lte: now },
          AND: [
            {
              OR: [{ endsAt: null }, { endsAt: { gte: visibilityLimit } }],
            },
            {
              OR: [
                { eligibleCustomers: { none: {} } },
                { eligibleCustomers: { some: { customerId } } },
              ],
            },
          ],
        },
        include: {
          _count: { select: { usages: true } },
          usages: { where: { customerId }, select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should read the coupon applied to the customer's cart", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([]);

      await service.findAvailableCoupons(customerId);

      expect(prismaMock.cart.findUnique).toHaveBeenCalledWith({
        where: { customerId },
        select: { couponId: true },
      });
    });

    it("should mark the coupon applied to the cart as in cart", async () => {
      const inCart = buildCoupon(null, 0);
      const other = buildCoupon(null, 0);

      prismaMock.coupon.findMany.mockResolvedValue([inCart, other]);
      prismaMock.cart.findUnique.mockResolvedValue({ couponId: inCart.id });

      const result = await service.findAvailableCoupons(customerId);

      expect(result.find(({ id }) => id === inCart.id)!.isInCart).toBe(true);
      expect(result.find(({ id }) => id === other.id)!.isInCart).toBe(false);
    });

    it("should not mark any coupon as in cart when the customer has no cart", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(null, 0)]);
      prismaMock.cart.findUnique.mockResolvedValue(null);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isInCart).toBe(false);
    });

    it("should mark a coupon the customer already used as used", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(null, 1, { usedByCustomer: true }),
      ]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isUsed).toBe(true);
      expect(coupon.isSoldOut).toBe(false);
    });

    it("should not mark a coupon the customer has not used as used", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(null, 0)]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isUsed).toBe(false);
    });

    it("should read the sold out instant from the usage that reached the limit", async () => {
      const coupon = buildCoupon(5, 8);

      prismaMock.coupon.findMany.mockResolvedValue([coupon]);

      await service.findAvailableCoupons(customerId);

      expect(prismaMock.couponUsage.findFirst).toHaveBeenCalledWith({
        where: { couponId: coupon.id },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        skip: 4,
      });
    });

    it("should not query the usages of a coupon that has not reached its limit", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(5, 4)]);

      await service.findAvailableCoupons(customerId);

      expect(prismaMock.couponUsage.findFirst).not.toHaveBeenCalled();
    });

    it("should return an empty list when there are no coupons", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([]);

      const result = await service.findAvailableCoupons(customerId);

      expect(result).toEqual([]);
    });

    it("should not mark a coupon without usageLimit as sold out nor return remainingUses", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(null, 100)]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(false);
      expect(coupon.remainingUses).toBeNull();
    });

    it("should not return remainingUses when more than 10 uses are left", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(20, 9)]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(false);
      expect(coupon.remainingUses).toBeNull();
    });

    it("should return remainingUses when 10 or fewer uses are left", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(20, 10)]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(false);
      expect(coupon.remainingUses).toBe(10);
    });

    it("should mark a coupon that reached its usage limit as sold out without remainingUses", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([buildCoupon(5, 5)]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(true);
      expect(coupon.remainingUses).toBeNull();
    });

    it("should keep a coupon sold out by usage limit less than 7 days ago", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(5, 5, {
          limitReachedAt: new Date("2026-07-03T12:00:00.000Z"),
        }),
      ]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(true);
    });

    it("should keep a coupon sold out by usage limit exactly 7 days ago", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(5, 5, { limitReachedAt: visibilityLimit }),
      ]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(true);
    });

    it("should drop a coupon that reached its usage limit more than 7 days ago", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(5, 5, {
          limitReachedAt: new Date("2026-07-01T12:00:00.000Z"),
        }),
      ]);

      const result = await service.findAvailableCoupons(customerId);

      expect(result).toEqual([]);
    });

    it("should mark an expired coupon as sold out without remainingUses", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(5, 1, { endsAt: new Date("2026-07-08T12:00:00.000Z") }),
      ]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(true);
      expect(coupon.remainingUses).toBeNull();
    });

    it("should not mark a coupon whose endsAt is still in the future as sold out", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(null, 0, { endsAt: new Date("2026-07-10T12:00:00.000Z") }),
      ]);

      const [coupon] = await service.findAvailableCoupons(customerId);

      expect(coupon.isSoldOut).toBe(false);
    });

    it("should use the earliest sold out cause when the coupon expired and reached its usage limit", async () => {
      prismaMock.coupon.findMany.mockResolvedValue([
        buildCoupon(5, 5, {
          endsAt: new Date("2026-07-01T12:00:00.000Z"),
          limitReachedAt: new Date("2026-07-08T12:00:00.000Z"),
        }),
      ]);

      const result = await service.findAvailableCoupons(customerId);

      expect(result).toEqual([]);
    });

    it("should sort available coupons first, with sold out and already used ones last", async () => {
      const soldOut = buildCoupon(5, 5);
      const used = buildCoupon(null, 1, { usedByCustomer: true });
      const available = buildCoupon(null, 0);

      prismaMock.coupon.findMany.mockResolvedValue([soldOut, used, available]);

      const result = await service.findAvailableCoupons(customerId);

      expect(result[0].id).toBe(available.id);
      expect(result.slice(1).map((coupon) => coupon.id)).toEqual(
        expect.arrayContaining([soldOut.id, used.id]),
      );
    });
  });

  describe("isCouponUnavailable", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return true when the coupon is not active", () => {
      const coupon = CouponFactory.createOne({ isActive: false });

      expect(service.isCouponUnavailable(coupon)).toBe(true);
    });

    it("should return true when startsAt is in the future", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        startsAt: new Date("2026-07-10T00:00:00.000Z"),
        endsAt: null,
      });

      expect(service.isCouponUnavailable(coupon)).toBe(true);
    });

    it("should return true when endsAt is in the past", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
        endsAt: new Date("2026-07-08T00:00:00.000Z"),
      });

      expect(service.isCouponUnavailable(coupon)).toBe(true);
    });

    it("should return false when active, started, and endsAt is null", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
        endsAt: null,
      });

      expect(service.isCouponUnavailable(coupon)).toBe(false);
    });

    it("should return false when active, started, and endsAt is in the future", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
        endsAt: new Date("2026-07-10T00:00:00.000Z"),
      });

      expect(service.isCouponUnavailable(coupon)).toBe(false);
    });
  });

  describe("calculateDiscount", () => {
    it("should return 0 when productsTotal is below minOrderValue", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 10000,
        discountType: "FIXED",
        discountValue: 500,
      });

      expect(service.calculateDiscount(coupon, 9999)).toBe(0);
    });

    it("should return 0 when the coupon is unavailable even if productsTotal meets the minimum", () => {
      const coupon = CouponFactory.createOne({
        isActive: false,
        minOrderValue: 0,
        discountType: "FIXED",
        discountValue: 500,
      });

      expect(service.calculateDiscount(coupon, 10000)).toBe(0);
    });

    it("should return the rounded percentage of productsTotal for PERCENTAGE coupons", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 0,
        discountType: "PERCENTAGE",
        discountValue: 15,
      });

      expect(service.calculateDiscount(coupon, 999)).toBe(150);
    });

    it("should cap the PERCENTAGE discount at productsTotal", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 0,
        discountType: "PERCENTAGE",
        discountValue: 150,
      });

      expect(service.calculateDiscount(coupon, 1000)).toBe(1000);
    });

    it("should return the fixed discount value for FIXED coupons", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 0,
        discountType: "FIXED",
        discountValue: 500,
      });

      expect(service.calculateDiscount(coupon, 10000)).toBe(500);
    });

    it("should cap the FIXED discount at productsTotal", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 0,
        discountType: "FIXED",
        discountValue: 5000,
      });

      expect(service.calculateDiscount(coupon, 3000)).toBe(3000);
    });
  });

  describe("hasReachedUsageLimit", () => {
    it("should return false without querying Prisma when usageLimit is null", async () => {
      const result = await service.hasReachedUsageLimit("coupon-1", null);

      expect(result).toBe(false);
      expect(prismaMock.couponUsage.count).not.toHaveBeenCalled();
    });

    it("should return false when usage count is below the limit", async () => {
      prismaMock.couponUsage.count.mockResolvedValue(2);

      const result = await service.hasReachedUsageLimit("coupon-1", 5);

      expect(result).toBe(false);
    });

    it("should return true when usage count equals the limit", async () => {
      prismaMock.couponUsage.count.mockResolvedValue(5);

      const result = await service.hasReachedUsageLimit("coupon-1", 5);

      expect(result).toBe(true);
    });

    it("should return true when usage count exceeds the limit", async () => {
      prismaMock.couponUsage.count.mockResolvedValue(6);

      const result = await service.hasReachedUsageLimit("coupon-1", 5);

      expect(result).toBe(true);
    });

    it("should query couponUsage.count with the couponId", async () => {
      prismaMock.couponUsage.count.mockResolvedValue(0);

      await service.hasReachedUsageLimit("coupon-1", 5);

      expect(prismaMock.couponUsage.count).toHaveBeenCalledWith({
        where: { couponId: "coupon-1" },
      });
    });
  });

  describe("hasCustomerUsedCoupon", () => {
    it("should return true when a usage record is found", async () => {
      prismaMock.couponUsage.findUnique.mockResolvedValue({
        id: "usage-1",
        couponId: "coupon-1",
        customerId: "customer-1",
        createdAt: new Date(),
      });

      const result = await service.hasCustomerUsedCoupon(
        "coupon-1",
        "customer-1",
      );

      expect(result).toBe(true);
    });

    it("should return false when no usage record is found", async () => {
      prismaMock.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.hasCustomerUsedCoupon(
        "coupon-1",
        "customer-1",
      );

      expect(result).toBe(false);
    });

    it("should query couponUsage.findUnique with the composite couponId_customerId key", async () => {
      prismaMock.couponUsage.findUnique.mockResolvedValue(null);

      await service.hasCustomerUsedCoupon("coupon-1", "customer-1");

      expect(prismaMock.couponUsage.findUnique).toHaveBeenCalledWith({
        where: {
          couponId_customerId: {
            couponId: "coupon-1",
            customerId: "customer-1",
          },
        },
      });
    });
  });

  describe("isCustomerEligibleForCoupon", () => {
    it("should return true when the customer has an explicit eligibility entry", async () => {
      prismaMock.couponCustomer.findUnique.mockResolvedValue({
        couponId: "coupon-1",
        customerId: "customer-1",
      });

      const result = await service.isCustomerEligibleForCoupon(
        "coupon-1",
        "customer-1",
      );

      expect(result).toBe(true);
      expect(prismaMock.couponCustomer.count).not.toHaveBeenCalled();
    });

    it("should return true when the customer has no explicit entry but the coupon is unrestricted", async () => {
      prismaMock.couponCustomer.findUnique.mockResolvedValue(null);
      prismaMock.couponCustomer.count.mockResolvedValue(0);

      const result = await service.isCustomerEligibleForCoupon(
        "coupon-1",
        "customer-1",
      );

      expect(result).toBe(true);
    });

    it("should return false when the coupon is restricted to other customers", async () => {
      prismaMock.couponCustomer.findUnique.mockResolvedValue(null);
      prismaMock.couponCustomer.count.mockResolvedValue(3);

      const result = await service.isCustomerEligibleForCoupon(
        "coupon-1",
        "customer-1",
      );

      expect(result).toBe(false);
    });

    it("should query the composite key first and the count only as a fallback", async () => {
      prismaMock.couponCustomer.findUnique.mockResolvedValue(null);
      prismaMock.couponCustomer.count.mockResolvedValue(0);

      await service.isCustomerEligibleForCoupon("coupon-1", "customer-1");

      expect(prismaMock.couponCustomer.findUnique).toHaveBeenCalledWith({
        where: {
          couponId_customerId: {
            couponId: "coupon-1",
            customerId: "customer-1",
          },
        },
        select: { couponId: true },
      });
      expect(prismaMock.couponCustomer.count).toHaveBeenCalledWith({
        where: { couponId: "coupon-1" },
      });
    });
  });

  describe("isCustomerEligibleForWelcomeCoupon", () => {
    it("should return true when the customer has zero non-cancelled orders", async () => {
      prismaMock.order.count.mockResolvedValue(0);

      const result =
        await service.isCustomerEligibleForWelcomeCoupon("customer-1");

      expect(result).toBe(true);
    });

    it("should return false when the customer has at least one non-cancelled order", async () => {
      prismaMock.order.count.mockResolvedValue(1);

      const result =
        await service.isCustomerEligibleForWelcomeCoupon("customer-1");

      expect(result).toBe(false);
    });

    it("should query order.count excluding cancelled orders for the customer", async () => {
      prismaMock.order.count.mockResolvedValue(0);

      await service.isCustomerEligibleForWelcomeCoupon("customer-1");

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: {
          customerId: "customer-1",
          status: { not: OrderStatus.CANCELLED },
        },
      });
    });
  });

  describe("calculateWelcomeDiscount", () => {
    it("should return 0 when the WELCOME_COUPON setting is not configured", async () => {
      const result = await service.calculateWelcomeDiscount(
        10000,
        {} as Record<SettingKey, string>,
      );

      expect(result).toBe(0);
    });

    it("should return the configured discount when it is below productsTotal", async () => {
      const settings = {
        WELCOME_COUPON: "500",
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(10000, settings);

      expect(result).toBe(500);
    });

    it("should cap the discount at productsTotal", async () => {
      const settings = {
        WELCOME_COUPON: "5000",
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(3000, settings);

      expect(result).toBe(3000);
    });

    it("should return 0 for an empty cart", async () => {
      const settings = {
        WELCOME_COUPON: "500",
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(0, settings);

      expect(result).toBe(0);
    });

    it("should yield NaN when the setting value is not numeric (validation is the admin's responsibility)", async () => {
      const settings = {
        WELCOME_COUPON: "abc",
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(3000, settings);

      expect(Number.isNaN(result)).toBe(true);
    });
  });
});
