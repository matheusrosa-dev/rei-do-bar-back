import { PrismaClient } from "../../src/shared/database/prisma/generated/client";
import { hashPassword } from "../../src/shared/helpers/password";
import { digits, neighborhoodName, streetName, uniqueDigits } from "./helpers";

export const DEMO_DELIVERY_PERSON_PASSWORD = "entregador123";

const deliveryPersons = [
  { name: "Anderson Ramos", hasPassword: true, isActive: true },
  { name: "Bruna Siqueira", hasPassword: true, isActive: true },
  { name: "Cleber Antunes", hasPassword: true, isActive: true },
  { name: "Douglas Prado", hasPassword: true, isActive: true },
  { name: "Elaine Tavares", hasPassword: false, isActive: true },
  { name: "Fábio Marinho", hasPassword: false, isActive: false },
];

export async function seedDeliveryPersons(prisma: PrismaClient) {
  console.log("Seeding delivery persons...");

  const hashedPassword = await hashPassword(DEMO_DELIVERY_PERSON_PASSWORD);

  const usedPhones = new Set<string>();
  const usedCpfs = new Set<string>();

  const data = deliveryPersons.map((deliveryPerson) => ({
    name: deliveryPerson.name,
    phone: `11${uniqueDigits(9, usedPhones)}`,
    cpf: uniqueDigits(11, usedCpfs),
    hashedPassword: deliveryPerson.hasPassword ? hashedPassword : null,
    addressStreet: streetName(),
    addressNumber: digits(3),
    addressNeighborhood: neighborhoodName(),
    addressZipCode: digits(8),
    isActive: deliveryPerson.isActive,
  }));

  await prisma.deliveryPerson.createMany({ data });

  const loginableCpfs = data
    .filter((deliveryPerson) => !!deliveryPerson.hashedPassword)
    .map((deliveryPerson) => deliveryPerson.cpf);

  console.log(
    `${data.length} delivery persons seeded. Login: cpf ${loginableCpfs.join(", ")} / password "${DEMO_DELIVERY_PERSON_PASSWORD}".`,
  );
}
