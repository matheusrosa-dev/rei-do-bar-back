import { Module } from "@nestjs/common";
import { AdminProductsController } from "./products.controller";
import { AdminProductsService } from "./products.service";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";

@Module({
  controllers: [AdminProductsController],
  providers: [AdminProductsService, AdminBasicAuthGuard],
})
export class AdminProductsModule {}
