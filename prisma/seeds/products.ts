import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

const products = [
  {
    name: "Corona Extra",
    description: "350ml",
    price: 899,
    stock: 11,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/corona-extra.png",
    category: "Cerveja",
  },
  {
    name: "Heineken",
    description: "350ml",
    price: 749,
    stock: 4,
    sortOrder: 2,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/heineken.png",
    category: "Cerveja",
  },
  {
    name: "Quinta do Morgado",
    description: "750ml",
    price: 4990,
    stock: 6,
    sortOrder: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/quinta-do-morgado.png",
    category: "Vinho",
  },
  {
    name: "Velho Barreiro",
    description: "1L",
    price: 2990,
    stock: 8,
    sortOrder: 4,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/velho-barreiro.png",
    category: "Destilado",
  },
];

export async function seedProducts(prisma: PrismaClient) {
  console.log("Seeding products...");

  const productsFound = await prisma.product.findMany({
    where: {
      OR: products.map((product) => ({ name: product.name })),
    },
  });

  const nonExistingProducts = products.filter(
    (_, index) => !productsFound[index],
  );

  const categories = await prisma.category.findMany();

  const areAllCategoriesFound = products.every((product) =>
    categories.some((category) => category.name === product.category),
  );

  if (!areAllCategoriesFound) {
    throw new Error("Some categories for the products were not found.");
  }

  await prisma.product.createMany({
    data: nonExistingProducts.map((product) => ({
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      sortOrder: product.sortOrder,
      isActive: true,
      stock: product.stock,
      categoryId: categories.find(
        (category) => category.name === product.category,
      )!.id,
    })),
  });

  const productsCount = products.length;
  const nonExistingCount = nonExistingProducts.length;

  console.log(
    `${nonExistingCount} products seeded (${productsCount - nonExistingCount} already existed).`,
  );
}
