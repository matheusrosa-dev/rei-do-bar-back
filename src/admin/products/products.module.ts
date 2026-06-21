import { Module } from "@nestjs/common";
import { AdminProductsController } from "./products.controller";
import { AdminProductsService } from "./products.service";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";

@Module({
  controllers: [AdminProductsController],
  providers: [AdminProductsService, BasicAuthGuard],
})
export class AdminProductsModule {}
