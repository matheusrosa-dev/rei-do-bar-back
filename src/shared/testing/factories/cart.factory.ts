import Chance from "chance";
import { Coupon } from "@shared/database/prisma/generated/client";
import { CartItemWithProduct, CartWithItems } from "./types";

const chance = new Chance();

type Props = {
  id?: string;
  customerId?: string;
  anonymousCustomerId?: string;
  couponId?: string | null;
  coupon?: Coupon | null;
  items: CartItemWithProduct[];
};

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
  anonymousCustomerId: props?.anonymousCustomerId ?? chance.guid(),
  couponId: props?.couponId ?? props?.coupon?.id ?? null,
  coupon: props?.coupon ?? null,
  items: props.items,
  createdAt: new Date(),
  updatedAt: new Date(),
});
