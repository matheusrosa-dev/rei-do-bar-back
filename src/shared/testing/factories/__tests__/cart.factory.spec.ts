import { ProductFactory } from "../product.factory";
import { CartItemFactory } from "../cart-item.factory";
import { CouponFactory } from "../coupon.factory";
import { CartFactory } from "../cart.factory";

describe("CartFactory", () => {
  const product = ProductFactory.createOne({ stockQuantity: 10 });
  const items = CartItemFactory.createMany(2, { product });

  describe("createOne", () => {
    it("should create a cart with the required items prop", () => {
      const cart = CartFactory.createOne({ items });

      expect(cart).toBeDefined();
      expect(cart.items).toBe(items);
    });

    it("should generate default values for optional props", () => {
      const cart = CartFactory.createOne({ items });

      expect(cart.id).toBeDefined();
      expect(cart.customerId).toBeDefined();
      expect(cart.anonymousCustomerId).toBeDefined();
      expect(cart.couponId).toBeNull();
      expect(cart.coupon).toBeNull();
      expect(cart.createdAt).toBeInstanceOf(Date);
      expect(cart.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const coupon = CouponFactory.createOne();
      const props = {
        id: "cart-id",
        customerId: "customer-id",
        anonymousCustomerId: "anonymous-customer-id",
        couponId: "cart-coupon-id",
        coupon,
        items,
      };

      const cart = CartFactory.createOne(props);

      expect(cart.id).toBe(props.id);
      expect(cart.customerId).toBe(props.customerId);
      expect(cart.anonymousCustomerId).toBe(props.anonymousCustomerId);
      expect(cart.couponId).toBe(props.couponId);
      expect(cart.coupon).toBe(coupon);
      expect(cart.items).toBe(props.items);
    });

    it("should derive couponId from the coupon prop when couponId is not provided", () => {
      const coupon = CouponFactory.createOne();

      const cart = CartFactory.createOne({ items, coupon });

      expect(cart.couponId).toBe(coupon.id);
    });

    it("should use the provided couponId even when it differs from the coupon prop", () => {
      const coupon = CouponFactory.createOne();

      const cart = CartFactory.createOne({
        items,
        coupon,
        couponId: "explicit-coupon-id",
      });

      expect(cart.couponId).toBe("explicit-coupon-id");
    });
  });

  describe("createMany", () => {
    it("should create the specified number of carts", () => {
      const carts = CartFactory.createMany(3, { items });

      expect(carts).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const carts = CartFactory.createMany(2, { items });

      expect(carts[0].id).not.toBe(carts[1].id);
    });

    it("should apply provided props to all created carts", () => {
      const customerId = "shared-customer-id";
      const carts = CartFactory.createMany(3, { items, customerId });

      for (const cart of carts) {
        expect(cart.customerId).toBe(customerId);
        expect(cart.items).toBe(items);
      }
    });
  });
});
