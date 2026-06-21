import { Module } from "@nestjs/common";
import { AdminProductsModule } from "./products/products.module";
import { AdminCategoriesModule } from "./categories/categories.module";
import { AdminCustomersModule } from "./customers/customers.module";
import { AdminOrdersModule } from "./orders/orders.module";
import { AdminSettingsModule } from "./settings/settings.module";
import { AdminNotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    AdminProductsModule,
    AdminCategoriesModule,
    AdminCustomersModule,
    AdminOrdersModule,
    AdminSettingsModule,
    AdminNotificationsModule,
  ],
})
export class AdminModule {}
