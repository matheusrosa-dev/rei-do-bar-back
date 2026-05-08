import { Body, Controller, Get, Post } from "@nestjs/common";
import { CartService } from "./cart.service";
import { AddToCartDto, CartDto } from "./dtos";
import {
  CurrentSession,
  type ICurrentSession,
} from "../shared/decorators/current-session.decorator";
import { Serialize } from "../shared/interceptors/serialize.interceptor";

@Controller("cart")
@Serialize(CartDto)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  //TODO: alterar para productId ser passado nos params
  @Post("add")
  async addToCart(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(session.deviceId, dto);
  }

  @Get()
  async getCart(@CurrentSession() session: ICurrentSession) {
    return this.cartService.getCart(session.deviceId);
  }
}
