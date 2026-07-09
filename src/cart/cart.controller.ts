import { Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CartService } from "./cart.service";
import {
  AddToCartDto,
  AssignCouponToCartDto,
  CartDto,
  DecrementProductQuantityDto,
  IncrementProductQuantityDto,
  RemoveFromCartDto,
} from "./dtos";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import type { ICurrentSession } from "@shared/types/jwt";

@Controller("cart")
@Serialize(CartDto)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentSession() session: ICurrentSession) {
    return this.cartService.getCart(session);
  }

  @Post("product/:productId")
  async addToCart(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(session, dto);
  }

  @Post("coupon/:couponCode")
  async assignCouponToCart(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: AssignCouponToCartDto,
  ) {
    return this.cartService.assignCouponToCart(session, dto);
  }

  @Delete("coupon")
  async removeCouponFromCart(@CurrentSession() session: ICurrentSession) {
    return this.cartService.removeCouponFromCart(session);
  }

  @Put("product/:productId/increment")
  async incrementProductQuantity(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: IncrementProductQuantityDto,
  ) {
    return this.cartService.incrementProductQuantity(session, dto);
  }

  @Put("product/:productId/decrement")
  async decrementProductQuantity(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: DecrementProductQuantityDto,
  ) {
    return this.cartService.decrementProductQuantity(session, dto);
  }

  @Delete("product/:productId")
  async removeFromCart(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: RemoveFromCartDto,
  ) {
    return this.cartService.removeFromCart(session, dto);
  }
}
