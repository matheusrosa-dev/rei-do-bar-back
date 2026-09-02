import { DeliveryPerson } from "@shared/database/prisma/generated/client";

export type DeliveryPersonWithCount = DeliveryPerson & {
  _count: { orders: number };
};

export type DeliveryPersonListItem = DeliveryPersonWithCount & {
  session: { refreshTokenExpiresAt: Date } | null;
};

export function mapDeliveryPerson({
  addressStreet,
  addressNumber,
  addressNeighborhood,
  addressZipCode,
  ...deliveryPerson
}: DeliveryPerson) {
  return {
    ...deliveryPerson,
    address: {
      street: addressStreet,
      number: addressNumber,
      neighborhood: addressNeighborhood,
      zipCode: addressZipCode,
    },
  };
}

export function mapDeliveryPersonWithCount({
  _count,
  ...deliveryPerson
}: DeliveryPersonWithCount) {
  return { ...mapDeliveryPerson(deliveryPerson), ordersCount: _count.orders };
}

export function mapDeliveryPersonListItem(
  { session, ...deliveryPerson }: DeliveryPersonListItem,
  now: Date,
) {
  return {
    ...mapDeliveryPersonWithCount(deliveryPerson),
    hasAccess: Boolean(
      deliveryPerson.isActive &&
        ((session && session.refreshTokenExpiresAt > now) ||
          deliveryPerson.hashedPassword),
    ),
  };
}
