import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminCustomersController } from "./customers.controller";
import { AdminCustomersService } from "./customers.service";

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService, BasicAuthGuard],
})
export class AdminCustomersModule {}
