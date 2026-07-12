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
    it("should return 0 when subtotal is below minOrderValue", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 10000,
        discountType: "FIXED",
        discountValue: 500,
      });

      expect(service.calculateDiscount(coupon, 9999)).toBe(0);
    });

    it("should return 0 when the coupon is unavailable even if subtotal meets the minimum", () => {
      const coupon = CouponFactory.createOne({
        isActive: false,
        minOrderValue: 0,
        discountType: "FIXED",
        discountValue: 500,
      });

      expect(service.calculateDiscount(coupon, 10000)).toBe(0);
    });

    it("should return the rounded percentage of the subtotal for PERCENTAGE coupons", () => {
      const coupon = CouponFactory.createOne({
        isActive: true,
        minOrderValue: 0,
        discountType: "PERCENTAGE",
        discountValue: 15,
      });

      expect(service.calculateDiscount(coupon, 999)).toBe(150);
    });

    it("should cap the PERCENTAGE discount at the subtotal", () => {
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

    it("should cap the FIXED discount at the subtotal", () => {
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

  describe("getWelcomeCoupon", () => {
    it("should return null when the WELCOME_COUPON setting is absent", () => {
      expect(
        service.getWelcomeCoupon({} as Record<SettingKey, string>),
      ).toBeNull();
    });

    it("should return null when the setting value is not valid JSON", () => {
      expect(
        service.getWelcomeCoupon({
          WELCOME_COUPON: "not-json",
        } as Record<SettingKey, string>),
      ).toBeNull();
    });

    it("should return null when discountValue is not a number", () => {
      expect(
        service.getWelcomeCoupon({
          WELCOME_COUPON: JSON.stringify({
            discountValue: "500",
            minOrderValue: 0,
          }),
        } as Record<SettingKey, string>),
      ).toBeNull();
    });

    it("should return null when minOrderValue is not a number", () => {
      expect(
        service.getWelcomeCoupon({
          WELCOME_COUPON: JSON.stringify({
            discountValue: 500,
            minOrderValue: "0",
          }),
        } as Record<SettingKey, string>),
      ).toBeNull();
    });

    it("should return the parsed discountValue and minOrderValue when the JSON is valid", () => {
      expect(
        service.getWelcomeCoupon({
          WELCOME_COUPON: JSON.stringify({
            discountValue: 500,
            minOrderValue: 1000,
          }),
        } as Record<SettingKey, string>),
      ).toEqual({ discountValue: 500, minOrderValue: 1000 });
    });
  });

  describe("isEligibleForWelcomeCoupon", () => {
    it("should return true when the customer has zero non-cancelled orders", async () => {
      prismaMock.order.count.mockResolvedValue(0);

      const result = await service.isEligibleForWelcomeCoupon("customer-1");

      expect(result).toBe(true);
    });

    it("should return false when the customer has at least one non-cancelled order", async () => {
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.isEligibleForWelcomeCoupon("customer-1");

      expect(result).toBe(false);
    });

    it("should query order.count excluding cancelled orders for the customer", async () => {
      prismaMock.order.count.mockResolvedValue(0);

      await service.isEligibleForWelcomeCoupon("customer-1");

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

    it("should return 0 when the subtotal is below the welcome coupon's minOrderValue", async () => {
      const settings = {
        WELCOME_COUPON: JSON.stringify({
          discountValue: 500,
          minOrderValue: 10000,
        }),
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(9999, settings);

      expect(result).toBe(0);
    });

    it("should return the discountValue when the subtotal meets the minimum", async () => {
      const settings = {
        WELCOME_COUPON: JSON.stringify({
          discountValue: 500,
          minOrderValue: 1000,
        }),
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(1000, settings);

      expect(result).toBe(500);
    });

    it("should cap the discount at the subtotal", async () => {
      const settings = {
        WELCOME_COUPON: JSON.stringify({
          discountValue: 5000,
          minOrderValue: 0,
        }),
      } as Record<SettingKey, string>;

      const result = await service.calculateWelcomeDiscount(3000, settings);

      expect(result).toBe(3000);
    });
  });
});
