import { CouponFactory } from "../coupon.factory";

describe("CouponFactory", () => {
  describe("createOne", () => {
    it("should create a coupon with default values", () => {
      const coupon = CouponFactory.createOne();

      expect(coupon).toBeDefined();
      expect(coupon.id).toBeDefined();
      expect(coupon.code).toBeDefined();
      expect(coupon.discountType).toBe("FIXED");
      expect(coupon.isActive).toBe(true);
      expect(coupon.endsAt).toBeNull();
      expect(coupon.usageLimit).toBeNull();
      expect(coupon.createdAt).toBeInstanceOf(Date);
      expect(coupon.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "coupon-id",
        code: "PROMO10",
        discountType: "PERCENTAGE" as const,
        discountValue: 10,
        minOrderValue: 5000,
        startsAt: new Date("2026-01-01"),
        endsAt: new Date("2026-12-31"),
        usageLimit: 100,
        isActive: false,
      };

      const coupon = CouponFactory.createOne(props);

      expect(coupon).toMatchObject(props);
    });
  });

  describe("createMany", () => {
    it("should create the specified number of coupons", () => {
      const coupons = CouponFactory.createMany(3);

      expect(coupons).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const coupons = CouponFactory.createMany(2);

      expect(coupons[0].id).not.toBe(coupons[1].id);
      expect(coupons[0].code).not.toBe(coupons[1].code);
    });

    it("should apply provided props to all created coupons", () => {
      const coupons = CouponFactory.createMany(3, { isActive: false });

      for (const coupon of coupons) {
        expect(coupon.isActive).toBe(false);
      }
    });
  });
});
