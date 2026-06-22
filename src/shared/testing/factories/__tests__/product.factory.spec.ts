import { ProductFactory } from "../product.factory";

describe("ProductFactory", () => {
  describe("createOne", () => {
    it("should create a product with the required stockQuantity prop", () => {
      const product = ProductFactory.createOne({ stockQuantity: 10 });

      expect(product).toBeDefined();
      expect(product.stockQuantity).toBe(10);
    });

    it("should generate default values for optional props", () => {
      const product = ProductFactory.createOne({ stockQuantity: 5 });

      expect(product.id).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.description).toBeDefined();
      expect(product.price).toBeDefined();
      expect(product.imageUrl).toBeDefined();
      expect(product.isActive).toBe(true);
      expect(product.categoryId).toBeDefined();
      expect(product.createdAt).toBeInstanceOf(Date);
      expect(product.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "fixed-id",
        name: "Burger",
        description: "A tasty burger",
        price: 25,
        imageUrl: "https://example.com/burger.jpg",
        isActive: false,
        stockQuantity: 3,
        categoryId: "cat-1",
        sortOrder: 2,
      };

      const product = ProductFactory.createOne(props);

      expect(product.id).toBe(props.id);
      expect(product.name).toBe(props.name);
      expect(product.description).toBe(props.description);
      expect(product.price).toBe(props.price);
      expect(product.imageUrl).toBe(props.imageUrl);
      expect(product.isActive).toBe(props.isActive);
      expect(product.stockQuantity).toBe(props.stockQuantity);
      expect(product.categoryId).toBe(props.categoryId);
      expect(product.sortOrder).toBe(props.sortOrder);
    });
  });

  describe("createMany", () => {
    it("should create the specified number of products", () => {
      const products = ProductFactory.createMany(3, { stockQuantity: 10 });

      expect(products).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const products = ProductFactory.createMany(2, { stockQuantity: 5 });

      expect(products[0].id).not.toBe(products[1].id);
    });

    it("should apply provided props to all created products", () => {
      const products = ProductFactory.createMany(3, {
        stockQuantity: 7,
        isActive: false,
      });

      for (const product of products) {
        expect(product.stockQuantity).toBe(7);
        expect(product.isActive).toBe(false);
      }
    });
  });
});
