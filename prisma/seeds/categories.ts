import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export const categories = [
  {
    name: "Cerveja",
    pluralName: "Cervejas",
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/cervejas.png",
    categoryGroup: "Bebidas",
  },
  {
    name: "Vinho",
    pluralName: "Vinhos",
    sortOrder: 2,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/vinhos.png",
    categoryGroup: "Bebidas",
  },
  {
    name: "Destilado",
    pluralName: "Destilados",
    sortOrder: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/destilados.png",
    categoryGroup: "Bebidas",
  },
  {
    name: "Energético",
    pluralName: "Energéticos",
    sortOrder: 4,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/energeticos.png",
    categoryGroup: "Bebidas",
  },
  {
    name: "Refrigerante",
    pluralName: "Refrigerantes",
    sortOrder: 5,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/refrigerantes.png",
    categoryGroup: "Bebidas",
  },
];

export async function seedCategories(prisma: PrismaClient) {
  console.log("Seeding categories...");

  const categoriesFound = await prisma.category.findMany({
    where: {
      OR: categories.map((category) => ({ name: category.name })),
    },
  });

  const existingNames = new Set(
    categoriesFound.map((category) => category.name),
  );

  const nonExistingCategories = categories.filter(
    (category) => !existingNames.has(category.name),
  );

  const categoryGroups = await prisma.categoryGroup.findMany();

  const areAllCategoryGroupsFound = categories.every((category) =>
    categoryGroups.some(
      (categoryGroup) => categoryGroup.name === category.categoryGroup,
    ),
  );

  if (!areAllCategoryGroupsFound) {
    throw new Error("Some category groups for the categories were not found.");
  }

  await prisma.category.createMany({
    data: nonExistingCategories.map((category) => ({
      name: category.name,
      pluralName: category.pluralName,
      isActive: true,
      sortOrder: category.sortOrder,
      imageUrl: category.imageUrl,
      categoryGroupId: categoryGroups.find(
        (categoryGroup) => categoryGroup.name === category.categoryGroup,
      )!.id,
    })),
  });

  const categoriesCount = categories.length;
  const nonExistingCount = nonExistingCategories.length;

  console.log(
    `${nonExistingCount} categories seeded (${categoriesCount - nonExistingCount} already existed).`,
  );
}
