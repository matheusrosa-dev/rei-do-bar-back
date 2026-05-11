import { Product } from "@shared/database/prisma/generated/client";
import Chance from "chance";
import { CartItemWithProduct } from "./types";

const chance = new Chance();

type Props = {
  id?: string;
  quantity?: number;
  cartId?: string;
  product: Product;
};

export class CartItemFactory {
  static createOne(props: Props) {
    return makeCartItem(props);
  }

  static createMany(count: number, props: Props) {
    return Array.from({ length: count }, () => makeCartItem(props));
  }
}

const makeCartItem = (props: Props): CartItemWithProduct => {
  return {
    id: props?.id ?? chance.guid(),
    quantity: props?.quantity ?? 1,
    productId: props.product.id,
    product: props.product,
    cartId: props?.cartId ?? chance.guid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};
