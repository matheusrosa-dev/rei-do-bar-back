import {
  AnonymousCustomer,
  Cart,
  CartItem,
  Product,
} from "@shared/database/prisma/generated/client";

export type CartItemWithProduct = CartItem & {
  product: Product;
};

export type CartWithItems = Cart & {
  items: CartItemWithProduct[];
};

export type AnonymousCustomerWithCart = AnonymousCustomer & {
  cart: CartWithItems;
};
