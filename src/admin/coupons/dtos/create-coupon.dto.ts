import { Transform, Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinDate,
} from "class-validator";
import { CouponDiscountType } from "@shared/database/prisma/generated/enums";
import { getEndOfDate, getStartOfTodaySaoPaulo } from "@shared/helpers/date";
import { IsAfterDate } from "../validators";

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

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
  @MinDate(() => getStartOfTodaySaoPaulo())
  startsAt!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @IsAfterDate("startsAt", {
    message: "A data de término deve ser posterior à data de início.",
  })
  @Transform(({ value }) => {
    if (value) {
      return getEndOfDate(value);
    }

    return value;
  })
  endsAt?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;
}
