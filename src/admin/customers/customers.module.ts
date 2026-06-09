import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { customersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [customersController],
  providers: [CustomersService, BasicAuthGuard],
})
export class CustomersModule {}
