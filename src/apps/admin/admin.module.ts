import { Module } from "@nestjs/common";
import { AdminProductsModule } from "./products/products.module";
import { AdminCategoriesModule } from "./categories/categories.module";
import { AdminCustomersModule } from "./customers/customers.module";
import { AdminOrdersModule } from "./orders/orders.module";
import { AdminSettingsModule } from "./settings/settings.module";
import { AdminNotificationsModule } from "./notifications/notifications.module";
import { AdminInventoryModule } from "./inventory/inventory.module";
import { AdminCouponsModule } from "./coupons/coupons.module";
import { AdminDeliveryPersonsModule } from "./delivery-persons/delivery-persons.module";

@Module({
  imports: [
    AdminProductsModule,
    AdminCategoriesModule,
    AdminCustomersModule,
    AdminOrdersModule,
    AdminSettingsModule,
    AdminNotificationsModule,
    AdminInventoryModule,
    AdminCouponsModule,
    AdminDeliveryPersonsModule,
  ],
})
export class AdminModule {}
