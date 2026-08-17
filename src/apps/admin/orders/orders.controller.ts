import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminOrdersService } from "./orders.service";
import {
  UpdateOrderStatusParamsDto,
  UpdateOrderStatusBodyDto,
  UpdateOrderDeliveryPersonParamsDto,
  UpdateOrderDeliveryPersonBodyDto,
  FindAllOrdersDto,
} from "./dtos";

@Controller("admin/orders")
@AdminAuth()
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  @Get("management")
  listOrdersManagement() {
    return this.ordersService.listOrdersManagement();
  }

  @Get()
  findAll(@Query() query: FindAllOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Patch(":orderId/status")
  updateOrderStatus(
    @Param() { orderId }: UpdateOrderStatusParamsDto,
    @Body() body: UpdateOrderStatusBodyDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, body);
  }

  @Patch(":orderId/delivery-person")
  updateOrderDeliveryPerson(
    @Param() { orderId }: UpdateOrderDeliveryPersonParamsDto,
    @Body() body: UpdateOrderDeliveryPersonBodyDto,
  ) {
    return this.ordersService.updateOrderDeliveryPerson(orderId, body);
  }
}
