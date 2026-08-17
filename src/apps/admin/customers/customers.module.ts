import { Module } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminCustomersController } from "./customers.controller";
import { AdminCustomersService } from "./customers.service";

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService, AdminBasicAuthGuard],
})
export class AdminCustomersModule {}
