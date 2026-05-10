import Chance from "chance";
import { Customer } from "@shared/database/prisma/generated/client";

const chance = new Chance();

type Props = {
  id?: string;
  name?: string;
  phone?: string;
  deviceId?: string;
  isActive?: boolean;
};

const makeCustomer = (props?: Props): Customer => ({
  id: props?.id ?? chance.guid(),
  name: props?.name ?? chance.name(),
  phone: props?.phone ?? chance.phone(),
  deviceId: props?.deviceId ?? chance.guid(),
  isActive: props?.isActive ?? true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export class CustomerFactory {
  static createOne(props?: Props) {
    return makeCustomer(props);
  }

  static createMany(count: number, props?: Props) {
    return Array.from({ length: count }, () => makeCustomer(props));
  }
}
