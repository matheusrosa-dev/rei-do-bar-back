import { Controller, Get } from "@nestjs/common";
import { CurrentDeliveryPerson } from "@shared/decorators/current-delivery-person.decorator";
import { DeliveryPersonAuth } from "@shared/decorators/delivery-person-auth.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import type { ICurrentDeliveryPerson } from "@shared/types/delivery-person";
import { DeliveryPersonsOrdersDto } from "./dtos";
import { DeliveryPersonsOrdersService } from "./orders.service";

@Controller("delivery-persons/orders")
@Serialize(DeliveryPersonsOrdersDto)
@DeliveryPersonAuth()
export class DeliveryPersonsOrdersController {
  constructor(private readonly ordersService: DeliveryPersonsOrdersService) {}

  @Get()
  findShippedOrders(
    @CurrentDeliveryPerson() deliveryPerson: ICurrentDeliveryPerson,
  ) {
    return this.ordersService.findShippedOrders(deliveryPerson.id);
  }
}
