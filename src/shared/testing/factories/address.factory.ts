import type { Address } from "@shared/database/prisma/generated/client";
import Chance from "chance";

const chance = new Chance();

type Props = {
  id?: string;
  customerId: string;
  street?: string;
  number?: string;
  complement?: string | null;
  neighborhood?: string;
  zipCode?: string;
  isMain?: boolean;
};

const makeAddress = (props: Props): Address => ({
  id: props?.id ?? chance.guid(),
  customerId: props.customerId,
  street: props?.street ?? chance.word(),
  number: props?.number ?? chance.integer({ min: 1, max: 9999 }).toString(),
  complement: props?.complement ?? null,
  neighborhood: props?.neighborhood ?? chance.word(),
  zipCode:
    props?.zipCode ??
    chance.integer({ min: 10000000, max: 99999999 }).toString(),
  isMain: props?.isMain ?? true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export class AddressFactory {
  static createOne(props: Props): Address {
    return makeAddress(props);
  }

  static createMany(count: number, props: Props): Address[] {
    return Array.from({ length: count }, () => makeAddress(props));
  }
}
