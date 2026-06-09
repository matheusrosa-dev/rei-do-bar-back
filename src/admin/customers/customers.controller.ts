import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { FindAllCustomersDto, ToggleStatusCustomerDto } from "./dtos";
import { CustomersService } from "./customers.service";

@Controller("admin/customers")
@AdminAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() dto: FindAllCustomersDto) {
    return this.customersService.findAll(dto);
  }

  @Patch(":customerId/activate")
  activateCustomer(@Param() { customerId }: ToggleStatusCustomerDto) {
    return this.customersService.activateCustomer(customerId);
  }

  @Patch(":customerId/deactivate")
  deactivateCustomer(@Param() { customerId }: ToggleStatusCustomerDto) {
    return this.customersService.deactivateCustomer(customerId);
  }
}
