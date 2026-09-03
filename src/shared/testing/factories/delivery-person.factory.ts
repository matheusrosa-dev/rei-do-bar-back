import type { DeliveryPerson } from "@shared/database/prisma/generated/client";
import Chance from "chance";

const chance = new Chance();

type Props = {
  id?: string;
  name?: string;
  phone?: string;
  cpf?: string;
  hashedPassword?: string | null;
  isActive?: boolean;
  isVolunteer?: boolean;
};

const makeDeliveryPerson = (props?: Props): DeliveryPerson => ({
  id: props?.id ?? chance.guid(),
  name: props?.name ?? chance.name(),
  phone: props?.phone ?? chance.string({ length: 11, pool: "0123456789" }),
  cpf: props?.cpf ?? chance.string({ length: 11, pool: "0123456789" }),
  hashedPassword: props?.hashedPassword ?? null,
  isActive: props?.isActive ?? true,
  isVolunteer: props?.isVolunteer ?? false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export class DeliveryPersonFactory {
  static createOne(props?: Props): DeliveryPerson {
    return makeDeliveryPerson(props);
  }

  static createMany(count: number, props?: Props): DeliveryPerson[] {
    return Array.from({ length: count }, () => makeDeliveryPerson(props));
  }
}
