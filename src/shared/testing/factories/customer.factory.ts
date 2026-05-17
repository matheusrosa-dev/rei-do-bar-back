import Chance from "chance";
import { CartWithItems, CustomerWithRelations } from "./types";
import type { Address } from "@shared/database/prisma/generated/client";

const chance = new Chance();

type Props = {
  id?: string;
  name?: string;
  phone?: string;
  isActive?: boolean;
  cart?: CartWithItems;
  addresses?: Address[];
};

const makeCustomer = (props: Props): CustomerWithRelations => ({
  id: props?.id ?? chance.guid(),
  name: props?.name === undefined ? chance.name() : props.name,
  phone: props?.phone ?? chance.phone(),
  isActive: props?.isActive ?? true,
  ...(props.cart !== undefined && { cart: props.cart }),
  ...(props.addresses !== undefined && { addresses: props.addresses }),
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
