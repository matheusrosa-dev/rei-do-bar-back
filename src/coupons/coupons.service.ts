import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  Coupon,
  OrderStatus,
  SettingKey,
} from "@shared/database/prisma/generated/client";

export const WELCOME_COUPON_CODE = "BEMVINDO";

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async isCustomerEligibleForWelcomeCoupon(
    customerId: string,
  ): Promise<boolean> {
    const nonCancelledOrdersCount = await this.prisma.order.count({
      where: { customerId, status: { not: OrderStatus.CANCELLED } },
    });

    return nonCancelledOrdersCount === 0;
  }

  async calculateWelcomeDiscount(
    subtotal: number,
    settings: Record<SettingKey, string>,
  ): Promise<number> {
    const welcomeCouponDiscount = Number(settings?.WELCOME_COUPON || 0);

    return Math.min(welcomeCouponDiscount, subtotal);
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
