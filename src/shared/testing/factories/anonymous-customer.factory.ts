import Chance from "chance";
import { CartWithItems, AnonymousCustomerWithCart } from "./types";

const chance = new Chance();

type Props = {
  id?: string;
  deviceId?: string;
  cart: CartWithItems;
};

const makeAnonymousCustomer = (props: Props): AnonymousCustomerWithCart => ({
  id: props?.id ?? chance.guid(),
  deviceId: props?.deviceId ?? chance.guid(),
  cart: props.cart,
  createdAt: new Date(),
});

export class AnonymousCustomerFactory {
  static createOne(props: Props) {
    return makeAnonymousCustomer(props);
  }

  static createMany(count: number, props: Props) {
    return Array.from({ length: count }, () => makeAnonymousCustomer(props));
  }
}
