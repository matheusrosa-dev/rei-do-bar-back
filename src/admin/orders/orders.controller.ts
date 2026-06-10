import { Controller, Get, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { OrdersService } from "./orders.service";
import { FindAllOrdersDto } from "./dtos";

@Controller("admin/orders")
@AdminAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() dto: FindAllOrdersDto) {
    return this.ordersService.findAll(dto);
  }
}
