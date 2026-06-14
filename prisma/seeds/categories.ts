import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export const categories = [
  { name: "Cerveja", pluralName: "Cervejas", sortOrder: 1 },
  { name: "Vinho", pluralName: "Vinhos", sortOrder: 2 },
  { name: "Destilado", pluralName: "Destilados", sortOrder: 3 },
  { name: "Energético", pluralName: "Energéticos", sortOrder: 4 },
  { name: "Refrigerante", pluralName: "Refrigerantes", sortOrder: 5 },
];

export async function seedCategories(prisma: PrismaClient) {
  console.log("Seeding categories...");

  const categoriesFound = await prisma.category.findMany({
    where: {
      OR: categories.map((category) => ({ name: category.name })),
    },
  });

  const nonExistingCategories = categories.filter(
    (_, index) => !categoriesFound[index],
  );

  await prisma.category.createMany({
    data: nonExistingCategories.map((category) => ({
      name: category.name,
      pluralName: category.pluralName,
      isActive: true,
      sortOrder: category.sortOrder,
    })),
  });

  const categoriesCount = categories.length;
  const nonExistingCount = nonExistingCategories.length;

  console.log(
    `${nonExistingCount} categories seeded (${categoriesCount - nonExistingCount} already existed).`,
  );
}
