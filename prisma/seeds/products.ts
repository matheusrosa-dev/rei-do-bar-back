import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

type SeedProduct = {
  name: string;
  description: string;
  price: number;
  stock: number;
  sortOrder?: number;
  imageUrl: string;
  category: string;
};

const products: SeedProduct[] = [
  {
    name: "Corona Extra",
    description: "330ml - Long Neck",
    price: 899,
    stock: 11,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/corona-extra.png",
    category: "Cerveja",
  },
  {
    name: "Heineken",
    description: "330ml - Long Neck",
    price: 749,
    stock: 4,
    sortOrder: 2,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/heineken.png",
    category: "Cerveja",
  },
  {
    name: "Brahma Duplo Malte",
    description: "350ml - Lata",
    price: 449,
    stock: 60,
    sortOrder: 5,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/brahma_duplo_malte.png",
    category: "Cerveja",
  },
  {
    name: "Skol",
    description: "269ml - Lata",
    price: 299,
    stock: 0,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/skol.png",
    category: "Cerveja",
  },
  {
    name: "Original",
    description: "350ml - Lata",
    price: 449,
    stock: 24,
    sortOrder: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/original.png",
    category: "Cerveja",
  },
  {
    name: "Stella Artois",
    description: "330ml - Long Neck",
    price: 690,
    stock: 18,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/stella_artois.png",
    category: "Cerveja",
  },
  {
    name: "Budweiser",
    description: "350ml - Lata",
    price: 549,
    stock: 7,
    sortOrder: 12,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/budweiser.png",
    category: "Cerveja",
  },
  {
    name: "Spaten",
    description: "350ml - Lata",
    price: 590,
    stock: 33,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/cervejas/spaten.png",
    category: "Cerveja",
  },
  {
    name: "Quinta do Morgado",
    description: "750ml",
    price: 1490,
    stock: 6,
    sortOrder: 4,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/quinta-do-morgado.png",
    category: "Vinho",
  },
  {
    name: "Pérgola Tinto Suave",
    description: "750ml",
    price: 1690,
    stock: 15,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/pergola_tinto_suave.png",
    category: "Vinho",
  },
  {
    name: "Santa Helena Reservado",
    description: "750ml",
    price: 2790,
    stock: 9,
    sortOrder: 2,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/santa_helena_reservado.png",
    category: "Vinho",
  },
  {
    name: "Salton Intenso Tinto Seco",
    description: "750ml",
    price: 2990,
    stock: 0,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/salton_intenso_tinto_seco.png",
    category: "Vinho",
  },
  {
    name: "Aurora Reserva Merlot",
    description: "750ml",
    price: 3290,
    stock: 12,
    sortOrder: 7,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/aurora-reserva-merlot.png",
    category: "Vinho",
  },
  {
    name: "Concha y Toro Reservado Cabernet",
    description: "750ml",
    price: 3490,
    stock: 20,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/concha_y_toro_reservado_cabernet.png",
    category: "Vinho",
  },
  {
    name: "Casillero del Diablo Carmenère",
    description: "750ml",
    price: 5490,
    stock: 5,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/vinhos/casillero_del_diablo_carmenere.png",
    category: "Vinho",
  },
  {
    name: "Velho Barreiro",
    description: "1L",
    price: 1690,
    stock: 8,
    sortOrder: 6,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/velho-barreiro.png",
    category: "Destilado",
  },
  {
    name: "Cachaça 51",
    description: "965ml",
    price: 1390,
    stock: 40,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/cachaca_51.png",
    category: "Destilado",
  },
  {
    name: "Smirnoff Vodka",
    description: "998ml",
    price: 3490,
    stock: 14,
    sortOrder: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/smirnoff_vodka.png",
    category: "Destilado",
  },
  {
    name: "Bacardi Carta Blanca",
    description: "980ml",
    price: 3990,
    stock: 0,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/bacardi_carta_blanca.png",
    category: "Destilado",
  },
  {
    name: "Johnnie Walker Red Label",
    description: "1L",
    price: 8990,
    stock: 6,
    sortOrder: 9,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/johnnie_walker_red_label.png",
    category: "Destilado",
  },
  {
    name: "Gin Tanqueray London Dry",
    description: "750ml",
    price: 11990,
    stock: 3,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/gin_tanqueray_london_dry.png",
    category: "Destilado",
  },
  {
    name: "Jack Daniel's Old No. 7",
    description: "1L",
    price: 12990,
    stock: 2,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/destilados/jack_daniels_old_no_7.png",
    category: "Destilado",
  },
  {
    name: "Red Bull",
    description: "250ml",
    price: 890,
    stock: 50,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/energeticos/red_bull.png",
    category: "Energético",
  },
  {
    name: "Monster",
    description: "473ml",
    price: 990,
    stock: 28,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/energeticos/monster.png",
    category: "Energético",
  },
  {
    name: "TNT",
    description: "269ml",
    price: 690,
    stock: 0,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/energeticos/tnt.png",
    category: "Energético",
  },
  {
    name: "Red Bull Tropical",
    description: "250ml",
    price: 890,
    stock: 17,
    sortOrder: 4,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/energeticos/red_bull_tropical.png",
    category: "Energético",
  },
  {
    name: "Baly",
    description: "2L",
    price: 1390,
    stock: 11,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/energeticos/baly.png",
    category: "Energético",
  },
  {
    name: "Coca-Cola",
    description: "350ml - Lata",
    price: 450,
    stock: 80,
    sortOrder: 1,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/coca_cola_lata.png",
    category: "Refrigerante",
  },
  {
    name: "Coca-Cola",
    description: "2L - Garrafa",
    price: 990,
    stock: 35,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/coca_cola.png",
    category: "Refrigerante",
  },
  {
    name: "Guaraná Antarctica",
    description: "350ml - Lata",
    price: 390,
    stock: 0,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/guarana_antarctica_lata.png",
    category: "Refrigerante",
  },
  {
    name: "Guaraná Antarctica",
    description: "2L - Garrafa",
    price: 890,
    stock: 22,
    sortOrder: 8,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/guarana_antarctica_2l.png",
    category: "Refrigerante",
  },
  {
    name: "Sprite",
    description: "350ml",
    price: 400,
    stock: 19,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/sprite.png",
    category: "Refrigerante",
  },
  {
    name: "Fanta Laranja",
    description: "2L",
    price: 850,
    stock: 13,
    imageUrl:
      "https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/products/refrigerantes/fanta_laranja.png",
    category: "Refrigerante",
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
