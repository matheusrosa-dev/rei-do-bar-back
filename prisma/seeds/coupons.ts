import {
  CouponDiscountType,
  PrismaClient,
} from "../../src/shared/database/prisma/generated/client";
import { addDays, chance, daysAgo, id, pickDistinct } from "./helpers";

const VIP_CUSTOMERS_COUNT = 12;
const SOLD_OUT_USAGE_LIMIT = 30;
const NEAR_LIMIT_USAGE_LIMIT = 12;
const NEAR_LIMIT_USAGES_COUNT = 5;
const CARTS_WITH_COUPON_COUNT = 8;

export const OPEN_COUPON_CODES = [
  "CERVEJAGELADA",
  "COMBO10",
  "PRIMEIRA15",
  "CARNAVAL",
];

export async function seedCoupons(prisma: PrismaClient) {
  console.log("Seeding coupons...");

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null, name: { not: null } },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const now = new Date();

  const coupons = [
    {
      id: id(),
      code: "CERVEJAGELADA",
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 10,
      minOrderValue: 3000,
      startsAt: daysAgo(60, now),
      endsAt: null,
      usageLimit: null,
      isActive: true,
    },
    {
      id: id(),
      code: "COMBO10",
      discountType: CouponDiscountType.FIXED,
      discountValue: 1000,
      minOrderValue: 5000,
      startsAt: daysAgo(30, now),
      endsAt: addDays(now, 30),
      usageLimit: 200,
      isActive: true,
    },
    {
      id: id(),
      code: "PRIMEIRA15",
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 15,
      minOrderValue: 2000,
      startsAt: daysAgo(90, now),
      endsAt: null,
      usageLimit: null,
      isActive: true,
    },
    {
      id: id(),
      code: "CARNAVAL",
      discountType: CouponDiscountType.FIXED,
      discountValue: 1500,
      minOrderValue: 6000,
      startsAt: daysAgo(20, now),
      endsAt: daysAgo(3, now),
      usageLimit: 50,
      isActive: true,
    },
    {
      id: id(),
      code: "ESQUENTA20",
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 20,
      minOrderValue: 8000,
      startsAt: addDays(now, 5),
      endsAt: addDays(now, 20),
      usageLimit: 100,
      isActive: true,
    },
    {
      id: id(),
      code: "RASCUNHO10",
      discountType: CouponDiscountType.FIXED,
      discountValue: 500,
      minOrderValue: 3000,
      startsAt: daysAgo(5, now),
      endsAt: null,
      usageLimit: null,
      isActive: false,
    },
    {
      id: id(),
      code: "LOTE30",
      discountType: CouponDiscountType.FIXED,
      discountValue: 1500,
      minOrderValue: 9000,
      startsAt: daysAgo(45, now),
      endsAt: null,
      usageLimit: SOLD_OUT_USAGE_LIMIT,
      isActive: true,
    },
    {
      id: id(),
      code: "ULTIMAS",
      discountType: CouponDiscountType.FIXED,
      discountValue: 800,
      minOrderValue: 3000,
      startsAt: daysAgo(10, now),
      endsAt: addDays(now, 10),
      usageLimit: NEAR_LIMIT_USAGE_LIMIT,
      isActive: true,
    },
    {
      id: id(),
      code: "VIPCLIENTES",
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 25,
      minOrderValue: 4000,
      startsAt: daysAgo(15, now),
      endsAt: addDays(now, 15),
      usageLimit: VIP_CUSTOMERS_COUNT,
      isActive: true,
    },
  ];

  await prisma.coupon.createMany({ data: coupons });

  const soldOutCoupon = coupons.find((coupon) => coupon.code === "LOTE30")!;
  const nearLimitCoupon = coupons.find((coupon) => coupon.code === "ULTIMAS")!;
  const vipCoupon = coupons.find((coupon) => coupon.code === "VIPCLIENTES")!;

  const vipCustomers = pickDistinct(customers, VIP_CUSTOMERS_COUNT);

  await prisma.couponCustomer.createMany({
    data: vipCustomers.map((customer) => ({
      couponId: vipCoupon.id,
      customerId: customer.id,
      createdAt: vipCoupon.startsAt,
    })),
  });

  const soldOutUsages = pickDistinct(customers, SOLD_OUT_USAGE_LIMIT).map(
    (customer) => ({
      couponId: soldOutCoupon.id,
      customerId: customer.id,
      createdAt: new Date(
        chance.integer({
          min: soldOutCoupon.startsAt.getTime(),
          max: daysAgo(2, now).getTime(),
        }),
      ),
    }),
  );

  const nearLimitUsages = pickDistinct(customers, NEAR_LIMIT_USAGES_COUNT).map(
    (customer) => ({
      couponId: nearLimitCoupon.id,
      customerId: customer.id,
      createdAt: new Date(
        chance.integer({
          min: nearLimitCoupon.startsAt.getTime(),
          max: now.getTime(),
        }),
      ),
    }),
  );

  const vipUsages = pickDistinct(vipCustomers, 4).map((customer) => ({
    couponId: vipCoupon.id,
    customerId: customer.id,
    createdAt: new Date(
      chance.integer({
        min: vipCoupon.startsAt.getTime(),
        max: now.getTime(),
      }),
    ),
  }));

  const usages = [...soldOutUsages, ...nearLimitUsages, ...vipUsages];

  await prisma.couponUsage.createMany({ data: usages });

  const cartsWithItems = await prisma.cart.findMany({
    where: { customerId: { not: null }, items: { some: {} } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: CARTS_WITH_COUPON_COUNT,
  });

  const cartCoupon = coupons.find((coupon) => coupon.code === "CERVEJAGELADA")!;

  await prisma.cart.updateMany({
    where: { id: { in: cartsWithItems.map((cart) => cart.id) } },
    data: { couponId: cartCoupon.id },
  });

  console.log(
    `${coupons.length} coupons seeded (${vipCustomers.length} restricted customers, ${usages.length} usages, ${cartsWithItems.length} carts with a coupon applied).`,
  );
}
