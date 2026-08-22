import { Module } from "@nestjs/common";
import { AdminProductsController } from "./products.controller";
import { AdminProductsService } from "./products.service";

@Module({
  controllers: [AdminProductsController],
  providers: [AdminProductsService],
})
export class AdminProductsModule {}
