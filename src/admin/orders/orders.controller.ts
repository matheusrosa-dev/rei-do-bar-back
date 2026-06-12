import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { OrdersService } from "./orders.service";
import { UpdateOrderStatusParamsDto, UpdateOrderStatusBodyDto } from "./dtos";

@Controller("admin/orders")
@AdminAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get("management")
  listOrdersManagement() {
    return this.ordersService.listOrdersManagement();
  }

  @Patch(":orderId/status")
  updateOrderStatus(
    @Param() { orderId }: UpdateOrderStatusParamsDto,
    @Body() body: UpdateOrderStatusBodyDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, body);
  }
}
