import { ProductFactory } from "../product.factory";
import { CartItemFactory } from "../cart-item.factory";
import { CartFactory } from "../cart.factory";

describe("CartFactory", () => {
  const product = ProductFactory.createOne({ stock: 10 });
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
      expect(cart.createdAt).toBeInstanceOf(Date);
      expect(cart.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "cart-id",
        customerId: "customer-id",
        items,
      };

      const cart = CartFactory.createOne(props);

      expect(cart.id).toBe(props.id);
      expect(cart.customerId).toBe(props.customerId);
      expect(cart.items).toBe(props.items);
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
