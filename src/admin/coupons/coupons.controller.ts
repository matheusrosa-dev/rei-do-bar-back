import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminCouponsService } from "./coupons.service";
import {
  CreateCouponDto,
  DeleteCouponDto,
  FindAllCouponsDto,
  ToggleStatusCouponDto,
} from "./dtos";

@Controller("admin/coupons")
@AdminAuth()
export class AdminCouponsController {
  constructor(private readonly couponsService: AdminCouponsService) {}

  @Get()
  findAll(@Query() dto: FindAllCouponsDto) {
    return this.couponsService.findAll(dto);
  }

  @Post()
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.couponsService.createCoupon(dto);
  }

  @Patch(":couponId/activate")
  activateCoupon(@Param() { couponId }: ToggleStatusCouponDto) {
    return this.couponsService.activateCoupon(couponId);
  }

  @Patch(":couponId/deactivate")
  deactivateCoupon(@Param() { couponId }: ToggleStatusCouponDto) {
    return this.couponsService.deactivateCoupon(couponId);
  }

  @Delete(":couponId")
  removeCoupon(@Param() { couponId }: DeleteCouponDto) {
    return this.couponsService.removeCoupon(couponId);
  }
}
