import { Controller, Post, UseGuards } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { type ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";

@Controller("orders")
@UseGuards(AccessTokenGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  createOrder(@CurrentSession() session: ICurrentSession) {
    return this.ordersService.createOrder(session.customerId!);
  }
}
