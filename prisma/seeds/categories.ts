import { PrismaClient } from "src/shared/database/prisma/generated/client";

const categories = [
  { name: "Cerveja", pluralName: "Cervejas" },
  { name: "Vinho", pluralName: "Vinhos" },
  { name: "Destilado", pluralName: "Destilados" },
  { name: "Energético", pluralName: "Energéticos" },
  { name: "Refrigerante", pluralName: "Refrigerantes" },
];

export async function seedCategories(prisma: PrismaClient) {
  console.log("Seeding categories...");

  const categoriesFound = await Promise.all(
    categories.map((category) =>
      prisma.category.findFirst({
        where: { name: category.name },
      }),
    ),
  );

  const nonExistingCategories = categories.filter(
    (_, index) => !categoriesFound[index],
  );

  await prisma.category.createMany({
    data: nonExistingCategories.map((category) => ({
      name: category.name,
      pluralName: category.pluralName,
      isActive: true,
    })),
  });

  const categoriesCount = categories.length;
  const nonExistingCount = nonExistingCategories.length;

  console.log(
    `${nonExistingCount} categories seeded (${categoriesCount - nonExistingCount} already existed).`,
  );
}
