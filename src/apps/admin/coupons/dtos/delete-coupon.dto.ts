import { IsUUID } from "class-validator";

export class DeleteCouponDto {
  @IsUUID()
  couponId!: string;
}
