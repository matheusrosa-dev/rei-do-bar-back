import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { type ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { CancelOrderDto, CreateOrderDto, OrdersDto } from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("orders")
@Serialize(OrdersDto)
@UseGuards(AccessTokenGuard)
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
