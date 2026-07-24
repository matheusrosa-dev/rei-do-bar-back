import { CouponDiscountType } from "@shared/database/prisma/generated/enums";
import { Expose } from "class-transformer";

export class CouponsDto {
  @Expose()
  id!: string;

  @Expose()
  code!: string;

  @Expose()
  discountType!: CouponDiscountType;

  @Expose()
  discountValue!: number;

  @Expose()
  minOrderValue!: number;

  @Expose()
  endsAt!: Date | null;

  @Expose()
  isSoldOut!: boolean;

  @Expose()
  isUsed!: boolean;

  @Expose()
  isInCart!: boolean;

  @Expose()
  remainingUses!: number | null;
}
