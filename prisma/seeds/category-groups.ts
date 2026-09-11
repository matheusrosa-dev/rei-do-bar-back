import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export const categoryGroups = [
  {
    name: "Bebidas",
    sortOrder: 1,
    allProductsImageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/bebidas.png",
    promotionsImageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/bebidas-promocao.png",
  },
  {
    name: "Petiscos",
    sortOrder: 2,
    allProductsImageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/petiscos.png",
    promotionsImageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/petiscos.png",
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
      allProductsImageUrl: categoryGroup.allProductsImageUrl,
      promotionsImageUrl: categoryGroup.promotionsImageUrl,
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
