import { Module } from "@nestjs/common";
import { ProductsModule } from "./products/products.module";
import { CategoriesModule } from "./categories/categories.module";
import { CustomersModule } from "./customers/customers.module";

@Module({
  imports: [ProductsModule, CategoriesModule, CustomersModule],
})
export class AdminModule {}
