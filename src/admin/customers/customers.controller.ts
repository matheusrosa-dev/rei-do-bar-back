import { Controller, Delete, Get, Param, Patch, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import {
  DeleteCustomerDto,
  FindAllCustomersDto,
  FindCustomerByIdDto,
  ToggleStatusCustomerDto,
} from "./dtos";
import { CustomersService } from "./customers.service";

@Controller("admin/customers")
@AdminAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() dto: FindAllCustomersDto) {
    return this.customersService.findAll(dto);
  }

  @Get(":customerId")
  findById(@Param() { customerId }: FindCustomerByIdDto) {
    return this.customersService.findById(customerId);
  }

  @Patch(":customerId/activate")
  activateCustomer(@Param() { customerId }: ToggleStatusCustomerDto) {
    return this.customersService.activateCustomer(customerId);
  }

  @Patch(":customerId/deactivate")
  deactivateCustomer(@Param() { customerId }: ToggleStatusCustomerDto) {
    return this.customersService.deactivateCustomer(customerId);
  }

  @Delete(":customerId")
  removeCustomer(@Param() { customerId }: DeleteCustomerDto) {
    return this.customersService.removeCustomer(customerId);
  }
}
