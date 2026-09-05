import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { type ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import {
  CancelOrderDto,
  CreateOrderDto,
  GetOrdersDto,
  OrdersDto,
  PaginatedOrdersDto,
} from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("orders")
@StoreAuth("accessToken")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Serialize(OrdersDto)
  createOrder(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(session.customerId!, dto);
  }

  @Get()
  @Serialize(PaginatedOrdersDto)
  getOrders(
    @CurrentSession() session: ICurrentSession,
    @Query() dto: GetOrdersDto,
  ) {
    return this.ordersService.getOrders(session.customerId!, dto);
  }

  @Put(":orderId/cancel")
  @Serialize(OrdersDto)
  async cancelOrder(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(session.customerId!, dto);
  }
}
