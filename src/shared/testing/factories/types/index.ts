import {
  Address,
  AnonymousCustomer,
  Cart,
  CartItem,
  Customer,
  Product,
} from "@shared/database/prisma/generated/client";

export type CartItemWithProduct = CartItem & {
  product: Product;
};

export type CartWithItems = Cart & {
  items: CartItemWithProduct[];
};

export type AnonymousCustomerWithRelations = AnonymousCustomer & {
  cart: CartWithItems;
};

export type CustomerWithRelations = Customer & {
  cart?: CartWithItems;
  addresses?: Address[];
};
