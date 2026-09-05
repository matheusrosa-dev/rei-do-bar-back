import {
  Coupon,
  OrderStatus,
  PaymentType,
  PrismaClient,
  SettingKey,
} from "../../src/shared/database/prisma/generated/client";
import { computeProductsTotals } from "../../src/shared/helpers/products-totals";
import { OPEN_COUPON_CODES } from "./coupons";
import {
  addMinutes,
  cancellationReason,
  chance,
  chunk,
  dateBetween,
  daysAgo,
  formatOrderAddress,
  hoursAgo,
  id,
  minutesAgo,
  pickDistinct,
} from "./helpers";

// Espelha WELCOME_COUPON_CODE do CouponsService sem carregar o módulo Nest no seed
const WELCOME_COUPON_CODE = "BEMVINDO";

const HISTORY_DAYS = 90;
const RECENT_CLUSTER_CUSTOMERS = 30;
const OPEN_ORDER_RATE = 65;
const CANCELLATION_RATE = 13;
const CANCELLED_AFTER_SHIPPING_RATE = 30;
const COUPON_ORDER_RATE = 22;
const WELCOME_COUPON_RATE = 40;
const OLD_DELIVERY_FEE_DAYS = 60;
const CURRENT_DELIVERY_FEE = 700;
const MAX_SHIPPING_MINUTES = 25;
const MAX_DELIVERY_MINUTES = 60;
const BATCH_SIZE = 500;

type SeedProduct = {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string;
};

type SeedOrderItem = {
  orderId: string;
  productId: string;
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
};

type SeedOrder = {
  id: string;
  customerId: string;
  address: string;
  status: OrderStatus;
  statusReason: string | null;
  deliveryFee: number;
  deliveryPersonBonus: number;
  deliveryPersonIsVolunteer: boolean;
  couponId: string | null;
  couponCode: string | null;
  couponDiscount: number;
  paymentType: PaymentType;
  deliveryPersonId: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildItems(orderId: string, products: SeedProduct[]): SeedOrderItem[] {
  const picked = pickDistinct(products, chance.integer({ min: 1, max: 5 }));

  return picked.map((product) => ({
    orderId,
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    quantity: chance.integer({ min: 1, max: 4 }),
  }));
}

function itemsTotal(items: SeedOrderItem[]) {
  return computeProductsTotals(items).productsTotalLessDiscount;
}

function addUnitToPriciestItem(items: SeedOrderItem[]) {
  const priciest = items.reduce(
    (highest, item) => (item.price > highest.price ? item : highest),
    items[0],
  );

  priciest.quantity += 1;
}

function calculateDiscount(coupon: Coupon, base: number, at: Date) {
  const isUnavailable =
    !coupon.isActive ||
    coupon.startsAt > at ||
    (!!coupon.endsAt && coupon.endsAt < at);

  if (isUnavailable || base < coupon.minOrderValue) {
    return 0;
  }

  if (coupon.discountType === "PERCENTAGE") {
    return Math.min(Math.round((base * coupon.discountValue) / 100), base);
  }

  return Math.min(coupon.discountValue, base);
}

function buildCouponDiscount(
  coupon: Coupon | null,
  welcomeDiscountValue: number,
  base: number,
  at: Date,
) {
  if (coupon) {
    return calculateDiscount(coupon, base, at);
  }

  return Math.min(welcomeDiscountValue, base);
}

function buildDeliveryFee(createdAt: Date, now: Date) {
  if (createdAt < daysAgo(OLD_DELIVERY_FEE_DAYS, now)) {
    return chance.pickone([0, 500]);
  }

  return CURRENT_DELIVERY_FEE;
}

function buildPaymentType() {
  return chance.weighted(
    [PaymentType.PIX, PaymentType.CARD, PaymentType.CASH],
    [5, 3, 2],
  );
}

export async function seedOrders(prisma: PrismaClient) {
  console.log("Seeding orders...");

  const now = new Date();

  const [
    customers,
    deliveryPersons,
    products,
    coupons,
    couponUsages,
    welcomeSetting,
    minOrderSetting,
    deliveryPersonBonusSetting,
  ] = await Promise.all([
    prisma.customer.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        name: { not: null },
        addresses: { some: { isMain: true } },
      },
      select: {
        id: true,
        createdAt: true,
        addresses: {
          where: { isMain: true },
          select: {
            street: true,
            number: true,
            neighborhood: true,
            zipCode: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.deliveryPerson.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        price: true,
        compareAtPrice: true,
        imageUrl: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.coupon.findMany({
      where: { code: { in: OPEN_COUPON_CODES } },
      orderBy: { code: "asc" },
    }),
    prisma.couponUsage.findMany({
      select: { couponId: true, customerId: true },
    }),
    prisma.setting.findUnique({ where: { key: SettingKey.WELCOME_COUPON } }),
    prisma.setting.findUnique({ where: { key: SettingKey.MIN_ORDER_VALUE } }),
    prisma.setting.findUnique({
      where: { key: SettingKey.DELIVERY_PERSON_BONUS },
    }),
  ]);

  const welcomeDiscountValue = welcomeSetting?.isActive
    ? Number(welcomeSetting.value)
    : 0;

  const minOrderValue = minOrderSetting?.isActive
    ? Number(minOrderSetting.value)
    : 0;

  const deliveryPersonBonusValue = deliveryPersonBonusSetting?.isActive
    ? Number(deliveryPersonBonusSetting.value)
    : 0;

  const deliveryPersonIds = deliveryPersons.map(
    (deliveryPerson) => deliveryPerson.id,
  );

  const deliveryPersonWeights = deliveryPersonIds.map((_, index) =>
    Math.max(deliveryPersonIds.length - index, 1),
  );

  const isVolunteerByDeliveryPersonId = new Map(
    deliveryPersons.map((deliveryPerson) => [
      deliveryPerson.id,
      deliveryPerson.isVolunteer,
    ]),
  );

  // Os usos já gravados pelo seed de cupons contam para o limite e para a regra
  // de um uso por cliente, exatamente como contariam no app
  const usageCountByCoupon = new Map<string, number>();
  const customersByCoupon = new Set<string>();

  for (const usage of couponUsages) {
    usageCountByCoupon.set(
      usage.couponId,
      (usageCountByCoupon.get(usage.couponId) ?? 0) + 1,
    );
    customersByCoupon.add(`${usage.couponId}|${usage.customerId}`);
  }

  const orders: SeedOrder[] = [];
  const items: SeedOrderItem[] = [];
  const usages: { couponId: string; customerId: string; createdAt: Date }[] =
    [];

  const shuffledCustomers = chance.shuffle(customers);

  shuffledCustomers.forEach((customer, customerIndex) => {
    const address = formatOrderAddress(customer.addresses[0]);
    const ordersCount = chance.weighted(
      [1, 2, 3, 4, 5, 6, 8, 10, 14],
      [6, 9, 12, 13, 13, 12, 10, 8, 5],
    );

    const historyStart = new Date(
      Math.max(
        customer.createdAt.getTime(),
        daysAgo(HISTORY_DAYS, now).getTime(),
      ),
    );

    const createdDates = Array.from({ length: ordersCount }, () =>
      dateBetween(historyStart, hoursAgo(11, now)),
    ).sort((a, b) => a.getTime() - b.getTime());

    if (customerIndex < RECENT_CLUSTER_CUSTOMERS) {
      createdDates[createdDates.length - 1] = hoursAgo(
        chance.floating({ min: 2, max: 9 }),
        now,
      );
    }

    let hasNonCancelledOrder = false;
    let lastClosedAt = historyStart;

    for (const createdAt of createdDates) {
      const orderId = id();
      const orderItems = buildItems(orderId, products);

      const isCancelled = chance.bool({ likelihood: CANCELLATION_RATE });
      const wasShipped =
        !isCancelled ||
        chance.bool({ likelihood: CANCELLED_AFTER_SHIPPING_RATE });

      const shippedAt = wasShipped
        ? addMinutes(
            createdAt,
            chance.integer({ min: 5, max: MAX_SHIPPING_MINUTES }),
          )
        : null;

      const deliveredAt =
        !isCancelled && shippedAt
          ? addMinutes(
              shippedAt,
              chance.integer({ min: 15, max: MAX_DELIVERY_MINUTES }),
            )
          : null;

      const cancelledAt = isCancelled
        ? addMinutes(
            shippedAt ?? createdAt,
            chance.integer({ min: shippedAt ? 10 : 3, max: 40 }),
          )
        : null;

      const deliveryFee = buildDeliveryFee(createdAt, now);

      const availableCoupons = coupons.filter((coupon) => {
        const usageCount = usageCountByCoupon.get(coupon.id) ?? 0;

        return (
          calculateDiscount(coupon, itemsTotal(orderItems), createdAt) > 0 &&
          !customersByCoupon.has(`${coupon.id}|${customer.id}`) &&
          (coupon.usageLimit === null || usageCount < coupon.usageLimit)
        );
      });

      const coupon =
        availableCoupons.length > 0 &&
        chance.bool({ likelihood: COUPON_ORDER_RATE })
          ? chance.pickone(availableCoupons)
          : null;

      const isWelcomeCoupon =
        !coupon &&
        !hasNonCancelledOrder &&
        !isCancelled &&
        welcomeDiscountValue > 0 &&
        chance.bool({ likelihood: WELCOME_COUPON_RATE });

      let couponDiscount = buildCouponDiscount(
        coupon,
        isWelcomeCoupon ? welcomeDiscountValue : 0,
        itemsTotal(orderItems),
        createdAt,
      );

      while (
        itemsTotal(orderItems) + deliveryFee - couponDiscount <
        minOrderValue
      ) {
        addUnitToPriciestItem(orderItems);

        couponDiscount = buildCouponDiscount(
          coupon,
          isWelcomeCoupon ? welcomeDiscountValue : 0,
          itemsTotal(orderItems),
          createdAt,
        );
      }

      if (!isCancelled) {
        hasNonCancelledOrder = true;
      }

      // O cancelamento antes do envio é o do cliente, que apaga o uso do cupom
      // (OrdersService.cancelOrder); depois do envio só o admin cancela, e o uso fica
      if (coupon && (!isCancelled || !!shippedAt)) {
        customersByCoupon.add(`${coupon.id}|${customer.id}`);
        usageCountByCoupon.set(
          coupon.id,
          (usageCountByCoupon.get(coupon.id) ?? 0) + 1,
        );
        usages.push({
          couponId: coupon.id,
          customerId: customer.id,
          createdAt,
        });
      }

      const deliveryPersonId = shippedAt
        ? chance.weighted(deliveryPersonIds, deliveryPersonWeights)
        : null;

      // Espelha o snapshot de bônus/voluntariado feito em OrdersService.updateOrderStatus
      // (e updateOrderDeliveryPerson) no momento em que um entregador é atribuído
      orders.push({
        id: orderId,
        customerId: customer.id,
        address,
        status: isCancelled ? OrderStatus.CANCELLED : OrderStatus.DELIVERED,
        statusReason: isCancelled ? cancellationReason() : null,
        deliveryFee,
        deliveryPersonBonus: deliveryPersonId ? deliveryPersonBonusValue : 0,
        deliveryPersonIsVolunteer: deliveryPersonId
          ? (isVolunteerByDeliveryPersonId.get(deliveryPersonId) ?? false)
          : false,
        couponId: coupon?.id ?? null,
        couponCode:
          coupon?.code ?? (isWelcomeCoupon ? WELCOME_COUPON_CODE : null),
        couponDiscount,
        paymentType: buildPaymentType(),
        deliveryPersonId,
        shippedAt,
        deliveredAt,
        cancelledAt,
        createdAt,
        updatedAt: cancelledAt ?? deliveredAt ?? createdAt,
      });

      items.push(...orderItems);

      lastClosedAt = cancelledAt ?? deliveredAt ?? createdAt;
    }

    if (!chance.bool({ likelihood: OPEN_ORDER_RATE })) {
      return;
    }

    const status = chance.weighted(
      [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SHIPPED],
      [3, 3, 4],
    );

    // O pedido aberto vem depois do último fechado: o app recusa um novo pedido
    // enquanto houver outro em andamento
    const openOrderStart = new Date(
      Math.max(lastClosedAt.getTime(), hoursAgo(6, now).getTime()),
    );

    const openOrderEnd =
      status === OrderStatus.SHIPPED
        ? minutesAgo(MAX_SHIPPING_MINUTES + 5, now)
        : now;

    if (openOrderStart >= openOrderEnd) {
      return;
    }

    const orderId = id();
    const orderItems = buildItems(orderId, products);
    const createdAt = dateBetween(openOrderStart, openOrderEnd);

    while (itemsTotal(orderItems) + CURRENT_DELIVERY_FEE < minOrderValue) {
      addUnitToPriciestItem(orderItems);
    }

    const shippedAt =
      status === OrderStatus.SHIPPED
        ? addMinutes(
            createdAt,
            chance.integer({ min: 5, max: MAX_SHIPPING_MINUTES }),
          )
        : null;

    const deliveryPersonId = shippedAt
      ? chance.weighted(deliveryPersonIds, deliveryPersonWeights)
      : null;

    orders.push({
      id: orderId,
      customerId: customer.id,
      address,
      status,
      statusReason: null,
      deliveryFee: CURRENT_DELIVERY_FEE,
      deliveryPersonBonus: deliveryPersonId ? deliveryPersonBonusValue : 0,
      deliveryPersonIsVolunteer: deliveryPersonId
        ? (isVolunteerByDeliveryPersonId.get(deliveryPersonId) ?? false)
        : false,
      couponId: null,
      couponCode: null,
      couponDiscount: 0,
      paymentType: buildPaymentType(),
      deliveryPersonId,
      shippedAt,
      deliveredAt: null,
      cancelledAt: null,
      createdAt,
      updatedAt: shippedAt ?? createdAt,
    });

    items.push(...orderItems);
  });

  orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const batch of chunk(orders, BATCH_SIZE)) {
    await prisma.order.createMany({ data: batch });
  }

  for (const batch of chunk(items, BATCH_SIZE * 2)) {
    await prisma.orderItem.createMany({ data: batch });
  }

  await prisma.couponUsage.createMany({ data: usages });

  console.log(
    `${orders.length} orders seeded (${items.length} items, ${usages.length} coupon usages).`,
  );
}
