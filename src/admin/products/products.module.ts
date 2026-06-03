import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, BasicAuthGuard],
})
export class ProductsModule {}
