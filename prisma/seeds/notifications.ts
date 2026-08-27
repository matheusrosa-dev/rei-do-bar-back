import {
  NotificationAction,
  NotificationStatus,
  NotificationTarget,
  OrderStatus,
  Prisma,
  PrismaClient,
} from "../../src/shared/database/prisma/generated/client";
import { getInactivityCutoff } from "../../src/apps/admin/notifications/helpers";
import { chance, dateBetween, daysAgo } from "./helpers";

const NOTIFICATIONS_COUNT = 25;
const HISTORY_DAYS = 60;
const FAILED_RATE = 15;

const templates = [
  {
    target: NotificationTarget.ALL,
    title: "Sextou! 🍻",
    description: "Cerveja gelada com entrega em até 40 minutos.",
    action: null,
  },
  {
    target: NotificationTarget.ALL,
    title: "Chegaram novidades",
    description: "Novos rótulos de vinho já estão no app.",
    action: null,
  },
  {
    target: NotificationTarget.ALL,
    title: "Frete promocional hoje",
    description: "Peça agora e economize na entrega.",
    action: null,
  },
  {
    target: NotificationTarget.NO_ORDERS,
    title: "Seu primeiro pedido sai com desconto",
    description: "Use o cupom BEMVINDO e ganhe R$5 de desconto.",
    action: null,
  },
  {
    target: NotificationTarget.ABANDONED_CART,
    title: "Você esqueceu algo no carrinho",
    description: "Finalize seu pedido antes que o estoque acabe.",
    action: NotificationAction.REDIRECT_TO_ORDERS,
  },
  {
    target: NotificationTarget.INACTIVE_30_DAYS,
    title: "Que saudade! 🍻",
    description: "Faz um tempo que você não pede. Bora repor o estoque?",
    action: NotificationAction.REDIRECT_TO_ORDERS,
  },
  {
    target: NotificationTarget.SINGLE_ORDER,
    title: "Gostou do primeiro pedido?",
    description: "O segundo sai com 10% de desconto no cupom CERVEJAGELADA.",
    action: NotificationAction.REDIRECT_TO_ORDERS,
  },
];

// Espelha AdminNotificationsService.resolveTargetWhere, que é privado
async function resolveTargetWhere(
  prisma: PrismaClient,
  target: NotificationTarget,
): Promise<Prisma.CustomerWhereInput> {
  switch (target) {
    case NotificationTarget.ALL:
      return {};
    case NotificationTarget.NO_ORDERS:
      return { orders: { none: { status: { not: OrderStatus.CANCELLED } } } };
    case NotificationTarget.ABANDONED_CART:
      return { cart: { is: { items: { some: {} } } } };
    case NotificationTarget.INACTIVE_30_DAYS:
      return {
        AND: [
          { orders: { some: { status: { not: OrderStatus.CANCELLED } } } },
          {
            orders: {
              none: {
                status: { not: OrderStatus.CANCELLED },
                createdAt: { gte: getInactivityCutoff() },
              },
            },
          },
        ],
      };
    case NotificationTarget.SINGLE_ORDER: {
      const groups = await prisma.order.groupBy({
        by: ["customerId"],
        where: { status: OrderStatus.DELIVERED },
        having: { customerId: { _count: { equals: 1 } } },
      });

      return { id: { in: groups.map((group) => group.customerId) } };
    }
  }
}

async function countCustomersForTarget(
  prisma: PrismaClient,
  target: NotificationTarget,
) {
  const targetWhere = await resolveTargetWhere(prisma, target);

  return prisma.customer.count({
    where: {
      isActive: true,
      deletedAt: null,
      pushTokens: { some: {} },
      ...targetWhere,
    },
  });
}

export async function seedNotifications(prisma: PrismaClient) {
  console.log("Seeding notifications...");

  const now = new Date();
  const countsByTarget = new Map<NotificationTarget, number>();

  for (const target of Object.values(NotificationTarget)) {
    countsByTarget.set(target, await countCustomersForTarget(prisma, target));
  }

  const notifications = Array.from(
    { length: NOTIFICATIONS_COUNT },
    (_, index) => {
      const template = templates[index % templates.length];
      const status = chance.bool({ likelihood: FAILED_RATE })
        ? NotificationStatus.FAILED
        : NotificationStatus.SENT;

      return {
        target: template.target,
        title: template.title,
        description: template.description,
        action: template.action,
        status,
        customersCount: countsByTarget.get(template.target) ?? 0,
        createdAt: dateBetween(daysAgo(HISTORY_DAYS, now), now),
      };
    },
  ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  await prisma.notification.createMany({ data: notifications });

  console.log(`${notifications.length} notifications seeded.`);
}
