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
import { ThrottlerModule } from "@nestjs/throttler";
import {
  IApiConfig,
  IRateLimitConfig,
} from "@shared/config/env-config.interface";
import { THROTTLER_NAMES } from "@shared/decorators/throttle.decorator";
import { CustomersModule } from "./customers/customers.module";
import { MeModule } from "./me/me.module";
import { OrdersModule } from "./orders/orders.module";
import { AdminModule } from "./admin/admin.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rateLimit = configService.get<IRateLimitConfig>("rateLimit")!;

        return {
          throttlers: THROTTLER_NAMES.map((name) => ({
            name,
            ...rateLimit[name],
          })),
        };
      },
    }),
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
