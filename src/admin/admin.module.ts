import { Module } from "@nestjs/common";
import { ProductsModule } from "./products/products.module";
import { CategoriesModule } from "./categories/categories.module";
import { CustomersModule } from "./customers/customers.module";
import { OrdersModule } from "./orders/orders.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    OrdersModule,
    SettingsModule,
  ],
})
export class AdminModule {}
