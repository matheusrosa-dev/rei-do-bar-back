import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  Coupon,
  OrderStatus,
  SettingKey,
} from "@shared/database/prisma/generated/client";

export const WELCOME_COUPON_CODE = "BEMVINDO";

const LOW_REMAINING_USES_THRESHOLD = 10;

const SOLD_OUT_VISIBILITY_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableCoupons(customerId: string) {
    const now = new Date();
    const visibilityLimit = new Date(
      now.getTime() - SOLD_OUT_VISIBILITY_DAYS * DAY_IN_MS,
    );

    const [coupons, cart] = await Promise.all([
      this.prisma.coupon.findMany({
        where: {
          isActive: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: visibilityLimit } }],
        },
        include: {
          _count: { select: { usages: true } },
          usages: { where: { customerId }, select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cart.findUnique({
        where: { customerId },
        select: { couponId: true },
      }),
    ]);

    const formattedCoupons = await Promise.all(
      coupons.map(async ({ _count, usages, ...coupon }) => {
        const soldOutAt = await this.getSoldOutAt(coupon, _count.usages, now);

        return {
          ...coupon,
          soldOutAt,
          isSoldOut: !!soldOutAt,
          isUsed: usages.length > 0,
          isInCart: coupon.id === cart?.couponId,
          remainingUses: soldOutAt
            ? null
            : this.getRemainingUses(coupon.usageLimit, _count.usages),
        };
      }),
    );

    const visibleCoupons = formattedCoupons
      .filter(({ soldOutAt }) => !soldOutAt || soldOutAt >= visibilityLimit)
      .map(({ soldOutAt, ...coupon }) => coupon);

    return this.sortCoupons(visibleCoupons);
  }

  async isCustomerEligibleForWelcomeCoupon(
    customerId: string,
  ): Promise<boolean> {
    const nonCancelledOrdersCount = await this.prisma.order.count({
      where: { customerId, status: { not: OrderStatus.CANCELLED } },
    });

    return nonCancelledOrdersCount === 0;
  }

  async calculateWelcomeDiscount(
    productsTotal: number,
    settings: Record<SettingKey, string>,
  ): Promise<number> {
    const welcomeCouponDiscount = Number(settings?.WELCOME_COUPON || 0);

    return Math.min(welcomeCouponDiscount, productsTotal);
  }

  isCouponUnavailable(coupon: Coupon): boolean {
    const now = new Date();

    if (!coupon.isActive) {
      return true;
    }

    if (coupon.startsAt > now) {
      return true;
    }

    if (coupon.endsAt && coupon.endsAt < now) {
      return true;
    }

    return false;
  }

  calculateDiscount(coupon: Coupon, productsTotal: number): number {
    if (
      productsTotal < coupon.minOrderValue ||
      this.isCouponUnavailable(coupon)
    ) {
      return 0;
    }

    if (coupon.discountType === "PERCENTAGE") {
      const discount = Math.round((productsTotal * coupon.discountValue) / 100);
      return Math.min(discount, productsTotal);
    }

    return Math.min(coupon.discountValue, productsTotal);
  }

  async hasReachedUsageLimit(
    couponId: string,
    usageLimit: number | null,
  ): Promise<boolean> {
    if (!usageLimit) {
      return false;
    }

    const usageCount = await this.prisma.couponUsage.count({
      where: { couponId },
    });

    return usageCount >= usageLimit;
  }

  async hasCustomerUsedCoupon(
    couponId: string,
    customerId: string,
  ): Promise<boolean> {
    const usage = await this.prisma.couponUsage.findUnique({
      where: {
        couponId_customerId: { couponId, customerId },
      },
    });

    return !!usage;
  }

  private async getSoldOutAt(
    coupon: Coupon,
    usageCount: number,
    now: Date,
  ): Promise<Date | null> {
    const soldOutDates: Date[] = [];

    if (coupon.endsAt && coupon.endsAt < now) {
      soldOutDates.push(coupon.endsAt);
    }

    const usageLimitReachedAt = await this.getUsageLimitReachedAt(
      coupon.id,
      coupon.usageLimit,
      usageCount,
    );

    if (usageLimitReachedAt) {
      soldOutDates.push(usageLimitReachedAt);
    }

    if (!soldOutDates.length) {
      return null;
    }

    return new Date(Math.min(...soldOutDates.map((date) => date.getTime())));
  }

  private async getUsageLimitReachedAt(
    couponId: string,
    usageLimit: number | null,
    usageCount: number,
  ): Promise<Date | null> {
    if (!usageLimit || usageCount < usageLimit) {
      return null;
    }

    const limitReachingUsage = await this.prisma.couponUsage.findFirst({
      where: { couponId },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
      skip: usageLimit - 1,
    });

    return limitReachingUsage?.createdAt ?? null;
  }

  private getRemainingUses(
    usageLimit: number | null,
    usageCount: number,
  ): number | null {
    if (usageLimit === null || usageCount >= usageLimit) {
      return null;
    }

    const remainingUses = usageLimit - usageCount;

    if (remainingUses > LOW_REMAINING_USES_THRESHOLD) {
      return null;
    }

    return remainingUses;
  }

  private sortCoupons<T extends { isSoldOut: boolean; isUsed: boolean }>(
    coupons: T[],
  ): T[] {
    const isUnavailable = (coupon: T) =>
      Number(coupon.isSoldOut || coupon.isUsed);

    return coupons.sort((a, b) => isUnavailable(a) - isUnavailable(b));
  }
}
