import { DeliveryPerson } from "@shared/database/prisma/generated/client";

export type DeliveryPersonWithCount = DeliveryPerson & {
  _count: { orders: number };
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
