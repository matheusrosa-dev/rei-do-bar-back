import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export const categories = [
  {
    name: "Cerveja",
    pluralName: "Cervejas",
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/beer.png",
  },
  {
    name: "Vinho",
    pluralName: "Vinhos",
    sortOrder: 2,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/wine.png",
  },
  {
    name: "Destilado",
    pluralName: "Destilados",
    sortOrder: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/spirit.png",
  },
  {
    name: "Energético",
    pluralName: "Energéticos",
    sortOrder: 4,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/energy.png",
  },
  {
    name: "Refrigerante",
    pluralName: "Refrigerantes",
    sortOrder: 5,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/soda.png",
  },
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
      imageUrl: category.imageUrl,
    })),
  });

  const categoriesCount = categories.length;
  const nonExistingCount = nonExistingCategories.length;

  console.log(
    `${nonExistingCount} categories seeded (${categoriesCount - nonExistingCount} already existed).`,
  );
}
