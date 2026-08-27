import { PrismaClient } from "../../src/shared/database/prisma/generated/client";
import { generateOtpCode } from "../../src/shared/helpers/otp-code";
import {
  addMinutes,
  chance,
  complementName,
  daysAgo,
  dateBetween,
  digits,
  fullName,
  id,
  neighborhoodName,
  pickDistinct,
  streetName,
  uniqueDigits,
} from "./helpers";

const CUSTOMERS_COUNT = 120;
const DELETED_CUSTOMERS_COUNT = 5;
const INACTIVE_CUSTOMERS_COUNT = 7;
const UNINITIALIZED_CUSTOMERS_COUNT = 10;
const ANONYMOUS_CUSTOMERS_COUNT = 20;
const LIVE_OTP_COUNT = 5;
const EXPIRED_OTP_COUNT = 3;
const ABANDONED_CART_RATE = 0.25;
const PUSH_TOKEN_RATE = 0.7;
const MAX_ADDRESSES_PER_CUSTOMER = 3;

const PUSH_TOKEN_POOL =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function buildPushToken() {
  return `ExponentPushToken[${chance.string({ length: 22, pool: PUSH_TOKEN_POOL })}]`;
}

export async function seedCustomers(prisma: PrismaClient) {
  console.log("Seeding customers...");

  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });

  const usedPhones = new Set<string>();
  const now = new Date();

  const customers: {
    id: string;
    name: string | null;
    phone: string;
    isActive: boolean;
    deletedAt: Date | null;
    createdAt: Date;
  }[] = [];

  for (let index = 0; index < CUSTOMERS_COUNT; index++) {
    const customerId = id();
    const isDeleted = index < DELETED_CUSTOMERS_COUNT;
    const isInactive =
      !isDeleted && index < DELETED_CUSTOMERS_COUNT + INACTIVE_CUSTOMERS_COUNT;
    const isUninitialized =
      !isDeleted &&
      !isInactive &&
      index <
        DELETED_CUSTOMERS_COUNT +
          INACTIVE_CUSTOMERS_COUNT +
          UNINITIALIZED_CUSTOMERS_COUNT;

    const createdAt = dateBetween(daysAgo(180, now), daysAgo(1, now));

    customers.push({
      id: customerId,
      name: isDeleted || isUninitialized ? null : fullName(),
      phone: isDeleted
        ? `deleted:${customerId}`
        : `11${uniqueDigits(9, usedPhones)}`,
      isActive: !isDeleted && !isInactive,
      deletedAt: isDeleted ? dateBetween(createdAt, now) : null,
      createdAt,
    });
  }

  await prisma.customer.createMany({ data: customers });

  const addressableCustomers = customers.filter(
    (customer) => !!customer.name && !customer.deletedAt,
  );

  const addresses = addressableCustomers.flatMap((customer) => {
    const addressesCount = chance.weighted(
      [1, 2, MAX_ADDRESSES_PER_CUSTOMER],
      [6, 3, 1],
    );

    const usedNumbers = new Set<string>();

    return Array.from({ length: addressesCount }, (_, index) => ({
      id: id(),
      customerId: customer.id,
      street: streetName(),
      number: uniqueDigits(3, usedNumbers),
      complement: chance.bool({ likelihood: 40 }) ? complementName() : null,
      neighborhood: neighborhoodName(),
      zipCode: digits(8),
      isMain: index === 0,
      createdAt: customer.createdAt,
    }));
  });

  await prisma.address.createMany({ data: addresses });

  // MeService.deleteMe apaga o carrinho junto com a anonimização
  const carts = customers
    .filter((customer) => !customer.deletedAt)
    .map((customer) => ({
      id: id(),
      customerId: customer.id,
      createdAt: customer.createdAt,
    }));

  await prisma.cart.createMany({ data: carts });

  const customersById = new Map(
    customers.map((customer) => [customer.id, customer]),
  );

  const cartItems = carts
    .filter((cart) => {
      const customer = customersById.get(cart.customerId)!;

      return (
        !!customer.name &&
        customer.isActive &&
        chance.bool({ likelihood: ABANDONED_CART_RATE * 100 })
      );
    })
    .flatMap((cart) =>
      pickDistinct(products, chance.integer({ min: 1, max: 4 })).map(
        (product) => ({
          cartId: cart.id,
          productId: product.id,
          quantity: chance.integer({ min: 1, max: 3 }),
        }),
      ),
    );

  await prisma.cartItem.createMany({ data: cartItems });

  const pushTokens = customers
    .filter(
      (customer) =>
        customer.isActive &&
        !customer.deletedAt &&
        chance.bool({ likelihood: PUSH_TOKEN_RATE * 100 }),
    )
    .map((customer) => ({
      customerId: customer.id,
      token: buildPushToken(),
      deviceId: id(),
      createdAt: customer.createdAt,
    }));

  await prisma.pushToken.createMany({ data: pushTokens });

  const anonymousCustomers = Array.from(
    { length: ANONYMOUS_CUSTOMERS_COUNT },
    () => ({
      id: id(),
      deviceId: id(),
      createdAt: dateBetween(daysAgo(30, now), now),
    }),
  );

  await prisma.anonymousCustomer.createMany({ data: anonymousCustomers });

  const anonymousCarts = anonymousCustomers.map((anonymousCustomer) => ({
    id: id(),
    anonymousCustomerId: anonymousCustomer.id,
    createdAt: anonymousCustomer.createdAt,
  }));

  await prisma.cart.createMany({ data: anonymousCarts });

  const anonymousCartItems = anonymousCarts
    .filter(() => chance.bool({ likelihood: 50 }))
    .flatMap((cart) =>
      pickDistinct(products, chance.integer({ min: 1, max: 3 })).map(
        (product) => ({
          cartId: cart.id,
          productId: product.id,
          quantity: chance.integer({ min: 1, max: 2 }),
        }),
      ),
    );

  await prisma.cartItem.createMany({ data: anonymousCartItems });

  const otpCodes = anonymousCustomers
    .slice(0, LIVE_OTP_COUNT + EXPIRED_OTP_COUNT)
    .map((anonymousCustomer, index) => ({
      anonymousCustomerId: anonymousCustomer.id,
      hashedCode: generateOtpCode().hashedCode,
      expiresAt:
        index < LIVE_OTP_COUNT
          ? addMinutes(now, chance.integer({ min: 2, max: 10 }))
          : addMinutes(now, -chance.integer({ min: 10, max: 600 })),
    }));

  await prisma.otpCode.createMany({ data: otpCodes });

  console.log(
    `${customers.length} customers seeded (${addresses.length} addresses, ${carts.length + anonymousCarts.length} carts, ${cartItems.length + anonymousCartItems.length} cart items, ${pushTokens.length} push tokens, ${anonymousCustomers.length} anonymous customers, ${otpCodes.length} otp codes).`,
  );
}
