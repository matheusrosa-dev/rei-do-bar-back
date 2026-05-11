import Chance from "chance";
import { CartItemWithProduct, CartWithItems } from "./types";

const chance = new Chance();

type Props = { id?: string; customerId?: string; items: CartItemWithProduct[] };

export class CartFactory {
  static createOne(props: Props) {
    return makeCart(props);
  }

  static createMany(count: number, props: Props) {
    return Array.from({ length: count }, () => makeCart(props));
  }
}

const makeCart = (props: Props): CartWithItems => ({
  id: props?.id ?? chance.guid(),
  customerId: props?.customerId ?? chance.guid(),
  items: props.items,
  createdAt: new Date(),
  updatedAt: new Date(),
});
