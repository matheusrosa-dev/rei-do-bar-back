import {
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

export type CustomerWithCart = Customer & {
  cart: CartWithItems;
};
