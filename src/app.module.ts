import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { CartModule } from "./cart/cart.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { DeviceIdGuard } from "./shared/guards/device-id.guard";
import { DelayInterceptor } from "@shared/interceptors/delay.interceptor";
import { ConfigService } from "@nestjs/config";
import { IApiConfig } from "@shared/config/env-config.interface";
import { CustomersModule } from "./customers/customers.module";
import { MeModule } from "./me/me.module";
import { OrdersModule } from "./orders/orders.module";
import { AdminModule } from "./admin/admin.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    SettingsModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    CustomersModule,
    MeModule,
    OrdersModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DeviceIdGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const api = configService.get<IApiConfig>("api")!;

        return new DelayInterceptor(api.delay);
      },
    },
  ],
})
export class AppModule {}
