import { CartItem } from "@shared/database/prisma/generated/client";
import Chance from "chance";

const chance = new Chance();

type Props = {
  id?: string;
  quantity?: number;
  productId?: string;
  cartId?: string;
};

export class CartItemFactory {
  static createOne(props?: Props) {
    return makeCartItem(props);
  }

  static createMany(count: number, props?: Props) {
    return Array.from({ length: count }, () => makeCartItem(props));
  }
}

const makeCartItem = (props?: Props): CartItem => {
  return {
    id: props?.id ?? chance.guid(),
    quantity: props?.quantity ?? 1,
    productId: props?.productId ?? chance.guid(),
    cartId: props?.cartId ?? chance.guid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};
