import { Module } from "@nestjs/common";
import { AdminCustomersController } from "./customers.controller";
import { AdminCustomersService } from "./customers.service";

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
})
export class AdminCustomersModule {}
