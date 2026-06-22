import { ProductFactory } from "../product.factory";
import { CartItemFactory } from "../cart-item.factory";

describe("CartItemFactory", () => {
  const product = ProductFactory.createOne({ stockQuantity: 10 });

  describe("createOne", () => {
    it("should create a cart item with the required product prop", () => {
      const item = CartItemFactory.createOne({ product });

      expect(item).toBeDefined();
      expect(item.product).toBe(product);
      expect(item.productId).toBe(product.id);
    });

    it("should generate default values for optional props", () => {
      const item = CartItemFactory.createOne({ product });

      expect(item.id).toBeDefined();
      expect(item.quantity).toBe(1);
      expect(item.cartId).toBeDefined();
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "item-id",
        quantity: 4,
        cartId: "cart-id",
        product,
      };

      const item = CartItemFactory.createOne(props);

      expect(item.id).toBe(props.id);
      expect(item.quantity).toBe(props.quantity);
      expect(item.cartId).toBe(props.cartId);
      expect(item.product).toBe(props.product);
      expect(item.productId).toBe(product.id);
    });
  });

  describe("createMany", () => {
    it("should create the specified number of cart items", () => {
      const items = CartItemFactory.createMany(3, { product });

      expect(items).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const items = CartItemFactory.createMany(2, { product });

      expect(items[0].id).not.toBe(items[1].id);
    });

    it("should apply provided props to all created items", () => {
      const items = CartItemFactory.createMany(3, { product, quantity: 5 });

      for (const item of items) {
        expect(item.quantity).toBe(5);
        expect(item.product).toBe(product);
      }
    });
  });
});
