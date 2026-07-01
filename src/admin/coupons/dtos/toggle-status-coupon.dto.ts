import { IsUUID } from "class-validator";

export class ToggleStatusCouponDto {
  @IsUUID()
  couponId!: string;
}
