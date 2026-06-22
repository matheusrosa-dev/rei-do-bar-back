import { ProductFactory } from "../product.factory";
import { CartItemFactory } from "../cart-item.factory";
import { CartFactory } from "../cart.factory";
import { CustomerFactory } from "../customer.factory";

describe("CustomerFactory", () => {
  const product = ProductFactory.createOne({ stockQuantity: 10 });
  const items = CartItemFactory.createMany(2, { product });
  const cart = CartFactory.createOne({ items });

  describe("createOne", () => {
    it("should create a customer with the required cart prop", () => {
      const customer = CustomerFactory.createOne({ cart });

      expect(customer).toBeDefined();
      expect(customer.cart).toBe(cart);
    });

    it("should generate default values for optional props", () => {
      const customer = CustomerFactory.createOne({ cart });

      expect(customer.id).toBeDefined();
      expect(customer.name).toBeDefined();
      expect(customer.phone).toBeDefined();
      expect(customer.isActive).toBe(true);
      expect(customer.createdAt).toBeInstanceOf(Date);
      expect(customer.updatedAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "customer-id",
        name: "John Doe",
        phone: "+5511999999999",
        isActive: false,
        cart,
      };

      const customer = CustomerFactory.createOne(props);

      expect(customer.id).toBe(props.id);
      expect(customer.name).toBe(props.name);
      expect(customer.phone).toBe(props.phone);
      expect(customer.isActive).toBe(props.isActive);
      expect(customer.cart).toBe(props.cart);
    });

    it("should allow name to be set to an empty string", () => {
      const customer = CustomerFactory.createOne({ name: "", cart });

      expect(customer.name).toBe("");
    });

    it("should allow name to be set to null", () => {
      const customer = CustomerFactory.createOne({ name: null, cart });

      expect(customer.name).toBeNull();
    });
  });

  describe("createMany", () => {
    it("should create the specified number of customers", () => {
      const customers = CustomerFactory.createMany(3, { cart });

      expect(customers).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const customers = CustomerFactory.createMany(2, { cart });

      expect(customers[0].id).not.toBe(customers[1].id);
    });

    it("should apply provided props to all created customers", () => {
      const customers = CustomerFactory.createMany(3, { cart });

      for (const customer of customers) {
        expect(customer.cart).toBe(cart);
      }
    });
  });
});
