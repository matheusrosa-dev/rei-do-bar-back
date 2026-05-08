import { Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CartService } from "./cart.service";
import {
  AddToCartDto,
  CartDto,
  DecrementProductQuantityDto,
  IncrementProductQuantityDto,
  RemoveFromCartDto,
} from "./dtos";
import {
  CurrentSession,
  type ICurrentSession,
} from "../shared/decorators/current-session.decorator";
import { Serialize } from "../shared/interceptors/serialize.interceptor";

@Controller("cart")
@Serialize(CartDto)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentSession() session: ICurrentSession) {
    return this.cartService.getCart(session.deviceId);
  }

  @Post("product/:productId")
  async addToCart(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(session.deviceId, dto);
  }

  @Put("product/:productId/increment")
  async incrementProductQuantity(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: IncrementProductQuantityDto,
  ) {
    return this.cartService.incrementProductQuantity(session.deviceId, dto);
  }

  @Put("product/:productId/decrement")
  async decrementProductQuantity(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: DecrementProductQuantityDto,
  ) {
    return this.cartService.decrementProductQuantity(session.deviceId, dto);
  }

  @Delete("product/:productId")
  async removeFromCart(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: RemoveFromCartDto,
  ) {
    return this.cartService.removeFromCart(session.deviceId, dto);
  }
}
