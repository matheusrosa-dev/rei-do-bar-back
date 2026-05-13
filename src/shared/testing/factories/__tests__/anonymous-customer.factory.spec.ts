import { ProductFactory } from "../product.factory";
import { CartItemFactory } from "../cart-item.factory";
import { CartFactory } from "../cart.factory";
import { AnonymousCustomerFactory } from "../anonymous-customer.factory";

describe("AnonymousCustomerFactory", () => {
  const product = ProductFactory.createOne({ stock: 10 });
  const items = CartItemFactory.createMany(2, { product });
  const cart = CartFactory.createOne({ items });

  describe("createOne", () => {
    it("should create an anonymous customer with the required cart prop", () => {
      const anonymousCustomer = AnonymousCustomerFactory.createOne({ cart });

      expect(anonymousCustomer).toBeDefined();
      expect(anonymousCustomer.cart).toBe(cart);
    });

    it("should generate default values for optional props", () => {
      const anonymousCustomer = AnonymousCustomerFactory.createOne({ cart });

      expect(anonymousCustomer.id).toBeDefined();
      expect(anonymousCustomer.deviceId).toBeDefined();
      expect(anonymousCustomer.createdAt).toBeInstanceOf(Date);
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "customer-id",
        deviceId: "device-id",
        cart,
      };

      const anonymousCustomer = AnonymousCustomerFactory.createOne(props);

      expect(anonymousCustomer.id).toBe(props.id);
      expect(anonymousCustomer.deviceId).toBe(props.deviceId);
      expect(anonymousCustomer.cart).toBe(props.cart);
    });
  });

  describe("createMany", () => {
    it("should create the specified number of anonymous customers", () => {
      const anonymousCustomers = AnonymousCustomerFactory.createMany(3, {
        cart,
      });

      expect(anonymousCustomers).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const anonymousCustomers = AnonymousCustomerFactory.createMany(2, {
        cart,
      });

      expect(anonymousCustomers[0].id).not.toBe(anonymousCustomers[1].id);
    });

    it("should apply provided props to all created anonymous customers", () => {
      const anonymousCustomers = AnonymousCustomerFactory.createMany(3, {
        cart,
      });

      for (const anonymousCustomer of anonymousCustomers) {
        expect(anonymousCustomer.cart).toBe(cart);
      }
    });
  });
});
