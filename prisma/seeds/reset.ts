import { PrismaClient } from "../../src/shared/database/prisma/generated/client";

export async function resetDemoData(prisma: PrismaClient) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("SEED_RESET is only allowed when NODE_ENV=development.");
  }

  console.log("Resetting demo data...");

  await prisma.inventoryMovementProduct.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.couponUsage.deleteMany();
  await prisma.couponCustomer.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.address.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.anonymousCustomer.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.deliveryPersonSession.deleteMany();
  await prisma.deliveryPerson.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  console.log("Demo data reset.");
}
