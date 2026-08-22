import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { CartModule } from "./cart/cart.module";
import { CustomersModule } from "./customers/customers.module";
import { MeModule } from "./me/me.module";
import { OrdersModule } from "./orders/orders.module";
import { SettingsModule } from "./settings/settings.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { CouponsModule } from "./coupons/coupons.module";

@Module({
  imports: [
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    CustomersModule,
    MeModule,
    OrdersModule,
    SettingsModule,
    NotificationsModule,
    CouponsModule,
  ],
})
export class StoreModule {}
