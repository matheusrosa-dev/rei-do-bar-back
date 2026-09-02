import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/shared/database/prisma/generated/client";
import {
  resetDemoData,
  seedCategories,
  seedCoupons,
  seedCustomers,
  seedDeliveryPersons,
  seedInventory,
  seedNotifications,
  seedOrders,
  seedProducts,
  seedSettings,
} from "./seeds";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter });

async function main() {
  await seedSettings(prisma);
  await seedCategories(prisma);

  const isDevelopment = process.env.NODE_ENV === "development";

  if (isDevelopment && process.env.SEED_RESET === "true") {
    await resetDemoData(prisma);
  }

  if (!isDevelopment) {
    return;
  }

  // O bloco de demonstração é semeado uma vez só: reexecutar não duplica nada.
  // Para recriá-lo, rode com SEED_RESET=true.
  const customersCount = await prisma.customer.count();

  if (customersCount > 0) {
    console.log("Demo data already seeded, skipping.");
    return;
  }

  await seedProducts(prisma);
  await seedCustomers(prisma);
  await seedDeliveryPersons(prisma);
  await seedCoupons(prisma);
  await seedOrders(prisma);
  await seedInventory(prisma);
  await seedNotifications(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
