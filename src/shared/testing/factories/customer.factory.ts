import Chance from "chance";
import { CartWithItems, CustomerWithCart } from "./types";

const chance = new Chance();

type Props = {
  id?: string;
  name?: string;
  phone?: string;
  deviceId?: string;
  isActive?: boolean;
  cart: CartWithItems;
};

const makeCustomer = (props: Props): CustomerWithCart => ({
  id: props?.id ?? chance.guid(),
  name: props?.name ?? chance.name(),
  phone: props?.phone ?? chance.phone(),
  deviceId: props?.deviceId ?? chance.guid(),
  isActive: props?.isActive ?? true,
  cart: props.cart,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export class CustomerFactory {
  static createOne(props: Props) {
    return makeCustomer(props);
  }

  static createMany(count: number, props: Props) {
    return Array.from({ length: count }, () => makeCustomer(props));
  }
}
