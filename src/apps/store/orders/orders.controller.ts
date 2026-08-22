import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { type ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { CancelOrderDto, CreateOrderDto, OrdersDto } from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("orders")
@Serialize(OrdersDto)
@StoreAuth("accessToken")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  createOrder(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(session.customerId!, dto);
  }

  @Get()
  getOrders(@CurrentSession() session: ICurrentSession) {
    return this.ordersService.getOrders(session.customerId!);
  }

  @Put(":orderId/cancel")
  async cancelOrder(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(session.customerId!, dto);
  }
}
