import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  Coupon,
  OrderStatus,
  SettingKey,
} from "@shared/database/prisma/generated/client";

export const WELCOME_COUPON_CODE = "BEMVINDO";

interface IWelcomeCoupon {
  discountValue: number;
  minOrderValue: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  getWelcomeCoupon(
    settings: Record<SettingKey, string>,
  ): IWelcomeCoupon | null {
    const rawValue = settings?.WELCOME_COUPON;

    if (!rawValue) {
      return null;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return null;
    }

    const { discountValue, minOrderValue } = (parsed ?? {}) as IWelcomeCoupon;

    if (
      typeof discountValue !== "number" ||
      typeof minOrderValue !== "number"
    ) {
      return null;
    }

    return { discountValue, minOrderValue };
  }

  async isEligibleForWelcomeCoupon(customerId: string): Promise<boolean> {
    const nonCancelledOrdersCount = await this.prisma.order.count({
      where: { customerId, status: { not: OrderStatus.CANCELLED } },
    });

    return nonCancelledOrdersCount === 0;
  }

  async calculateWelcomeDiscount(
    customerId: string,
    subtotal: number,
    settings: Record<SettingKey, string>,
  ): Promise<number> {
    const welcomeCoupon = this.getWelcomeCoupon(settings);

    if (!welcomeCoupon || subtotal < welcomeCoupon.minOrderValue) {
      return 0;
    }

    const isEligible = await this.isEligibleForWelcomeCoupon(customerId);

    if (!isEligible) {
      return 0;
    }

    return Math.min(welcomeCoupon.discountValue, subtotal);
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

  calculateDiscount(coupon: Coupon, subtotal: number): number {
    if (subtotal < coupon.minOrderValue || this.isCouponUnavailable(coupon)) {
      return 0;
    }

    if (coupon.discountType === "PERCENTAGE") {
      const discount = Math.round((subtotal * coupon.discountValue) / 100);
      return Math.min(discount, subtotal);
    }

    return Math.min(coupon.discountValue, subtotal);
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
}
