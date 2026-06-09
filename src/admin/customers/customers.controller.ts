import { Controller, Get, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { FindAllCustomersDto } from "./dtos";
import { CustomersService } from "./customers.service";

@Controller("admin/customers")
@AdminAuth()
export class customersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() dto: FindAllCustomersDto) {
    return this.customersService.findAll(dto);
  }
}
