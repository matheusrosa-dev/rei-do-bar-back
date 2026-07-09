import type { Coupon } from "@shared/database/prisma/generated/client";
import Chance from "chance";

const chance = new Chance();

type Props = {
  id?: string;
  code?: string;
  discountType?: Coupon["discountType"];
  discountValue?: number;
  minOrderValue?: number;
  startsAt?: Date;
  endsAt?: Date | null;
  usageLimit?: number | null;
  isActive?: boolean;
};

const makeCoupon = (props?: Props): Coupon => ({
  id: props?.id ?? chance.guid(),
  code: props?.code ?? chance.word().toUpperCase(),
  discountType: props?.discountType ?? "FIXED",
  discountValue: props?.discountValue ?? chance.integer({ min: 1, max: 1000 }),
  minOrderValue: props?.minOrderValue ?? 0,
  startsAt: props?.startsAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24),
  endsAt: props?.endsAt ?? null,
  usageLimit: props?.usageLimit ?? null,
  isActive: props?.isActive ?? true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export class CouponFactory {
  static createOne(props?: Props): Coupon {
    return makeCoupon(props);
  }

  static createMany(count: number, props?: Props): Coupon[] {
    return Array.from({ length: count }, () => makeCoupon(props));
  }
}
