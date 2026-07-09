import { IsNotEmpty, IsString } from "class-validator";

export class AssignCouponToCartDto {
  @IsString()
  @IsNotEmpty()
  couponCode!: string;
}
