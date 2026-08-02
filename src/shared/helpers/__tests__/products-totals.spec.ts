import { computeOrderTotals, computeProductsTotals } from "../products-totals";

describe("Products Totals Helpers", () => {
  describe("computeProductsTotals", () => {
    it("should return zeroed totals for an empty item list", () => {
      expect(computeProductsTotals([])).toStrictEqual({
        productsTotal: 0,
        productsDiscount: 0,
        productsCount: 0,
        productsTotalLessDiscount: 0,
      });
    });

    it("should use price and leave productsDiscount at zero when no item is on sale", () => {
      const result = computeProductsTotals([
        { price: 1000, compareAtPrice: null, quantity: 2 },
        { price: 500, compareAtPrice: null, quantity: 1 },
      ]);

      expect(result).toStrictEqual({
        productsTotal: 2500,
        productsDiscount: 0,
        productsCount: 3,
        productsTotalLessDiscount: 2500,
      });
    });

    it("should use compareAtPrice and accumulate productsDiscount for on-sale items", () => {
      const result = computeProductsTotals([
        { price: 800, compareAtPrice: 1000, quantity: 2 },
        { price: 500, compareAtPrice: null, quantity: 1 },
      ]);

      expect(result).toStrictEqual({
        productsTotal: 2500,
        productsDiscount: 400,
        productsCount: 3,
        productsTotalLessDiscount: 2100,
      });
    });

    it("should not treat compareAtPrice as an on-sale price when it is lower than or equal to price", () => {
      const result = computeProductsTotals([
        { price: 1000, compareAtPrice: 1000, quantity: 1 },
        { price: 1000, compareAtPrice: 800, quantity: 1 },
      ]);

      expect(result).toStrictEqual({
        productsTotal: 2000,
        productsDiscount: 0,
        productsCount: 2,
        productsTotalLessDiscount: 2000,
      });
    });

    it("should keep productsTotalLessDiscount equal to the price total regardless of compareAtPrice", () => {
      const items = [
        { price: 30, compareAtPrice: 100, quantity: 3 },
        { price: 70, compareAtPrice: 50, quantity: 2 },
        { price: 10, compareAtPrice: null, quantity: 1 },
      ];

      const priceTotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      expect(computeProductsTotals(items).productsTotalLessDiscount).toBe(
        priceTotal,
      );
    });
  });

  describe("computeOrderTotals", () => {
    it("should build the total from the net products total, the delivery fee and the coupon discount", () => {
      const result = computeOrderTotals({
        items: [{ price: 800, compareAtPrice: 1000, quantity: 2 }],
        deliveryFee: 200,
        couponDiscount: 500,
      });

      expect(result).toStrictEqual({
        productsTotal: 2000,
        productsDiscount: 400,
        total: 1300,
      });
    });

    it("should never discount the coupon against the gross productsTotal", () => {
      const onSale = computeOrderTotals({
        items: [{ price: 30, compareAtPrice: 100, quantity: 1 }],
        deliveryFee: 0,
        couponDiscount: 30,
      });

      expect(onSale.productsTotal).toBe(100);
      expect(onSale.total).toBe(0);
    });

    it("should not clamp a couponDiscount larger than the net products total", () => {
      const result = computeOrderTotals({
        items: [{ price: 1000, compareAtPrice: null, quantity: 1 }],
        deliveryFee: 0,
        couponDiscount: 1500,
      });

      expect(result.total).toBe(-500);
    });

    it("should keep the total unchanged for items without a compareAtPrice", () => {
      const result = computeOrderTotals({
        items: [{ price: 1000, compareAtPrice: null, quantity: 2 }],
        deliveryFee: 200,
        couponDiscount: 100,
      });

      expect(result).toStrictEqual({
        productsTotal: 2000,
        productsDiscount: 0,
        total: 2100,
      });
    });
  });
});
