import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { ProductsController } from "./products.controller";
import { CustomersModule } from "../customers/customers.module";

@Module({
  imports: [CustomersModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
