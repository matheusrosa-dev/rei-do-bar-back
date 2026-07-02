import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { CouponDiscountType } from "@shared/database/prisma/generated/enums";

export class UpdateCouponParamsDto {
  @IsUUID()
  couponId!: string;
}

export class UpdateCouponBodyDto {
  @IsEnum(CouponDiscountType)
  discountType!: CouponDiscountType;

  @IsInt()
  @Min(0)
  discountValue!: number;

  @IsInt()
  @Min(0)
  minOrderValue!: number;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsInt()
  usageLimit?: number;
}
