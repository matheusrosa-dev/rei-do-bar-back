import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/shared/database/prisma/generated/client";
import {
  resetDemoData,
  seedCategories,
  seedCoupons,
  seedCustomers,
  seedDeliveryPersons,
  seedDemoSettings,
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

  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (process.env.SEED_RESET === "true") {
    await resetDemoData(prisma);
  }

  await seedCategories(prisma);
  await seedProducts(prisma);

  // O bloco de demonstração é semeado uma vez só: reexecutar não duplica nada.
  // Para recriá-lo, rode com SEED_RESET=true.
  const customersCount = await prisma.customer.count();

  if (customersCount > 0) {
    console.log("Demo data already seeded, skipping.");
    return;
  }

  await seedDemoSettings(prisma);
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
