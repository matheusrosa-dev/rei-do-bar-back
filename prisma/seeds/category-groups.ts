import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export const categoryGroups = [
  {
    name: "Bebidas",
    sortOrder: 1,
  },
];

export async function seedCategoryGroups(prisma: PrismaClient) {
  console.log("Seeding category groups...");

  const categoryGroupsFound = await prisma.categoryGroup.findMany({
    where: {
      OR: categoryGroups.map((categoryGroup) => ({ name: categoryGroup.name })),
    },
  });

  const existingNames = new Set(
    categoryGroupsFound.map((categoryGroup) => categoryGroup.name),
  );

  const nonExistingCategoryGroups = categoryGroups.filter(
    (categoryGroup) => !existingNames.has(categoryGroup.name),
  );

  await prisma.categoryGroup.createMany({
    data: nonExistingCategoryGroups.map((categoryGroup) => ({
      name: categoryGroup.name,
      isActive: true,
      sortOrder: categoryGroup.sortOrder,
    })),
  });

  const categoryGroupsCount = categoryGroups.length;
  const nonExistingCount = nonExistingCategoryGroups.length;

  console.log(
    `${nonExistingCount} category groups seeded (${categoryGroupsCount - nonExistingCount} already existed).`,
  );
}
