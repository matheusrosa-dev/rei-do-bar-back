import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/shared/database/prisma/generated/client";
import { seedCategories, seedProducts, seedSettings } from "./seeds";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedSettings(prisma);

  if (process.env.NODE_ENV === "development") {
    await seedCategories(prisma);
    await seedProducts(prisma);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
