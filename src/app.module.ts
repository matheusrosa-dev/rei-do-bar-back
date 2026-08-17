import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./apps/store/auth/auth.module";
import { CategoriesModule } from "./apps/store/categories/categories.module";
import { ProductsModule } from "./apps/store/products/products.module";
import { CartModule } from "./apps/store/cart/cart.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { DeviceIdGuard } from "./shared/guards/device-id.guard";
import { DelayInterceptor } from "@shared/interceptors/delay.interceptor";
import { ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import {
  IApiConfig,
  IRateLimitConfig,
} from "@shared/config/env-config.interface";
import { THROTTLER_NAMES } from "@shared/decorators/throttle.decorator";
import { CustomersModule } from "./apps/store/customers/customers.module";
import { MeModule } from "./apps/store/me/me.module";
import { OrdersModule } from "./apps/store/orders/orders.module";
import { AdminModule } from "./apps/admin/admin.module";
import { SettingsModule } from "./apps/store/settings/settings.module";
import { NotificationsModule } from "./apps/store/notifications/notifications.module";
import { CouponsModule } from "./apps/store/coupons/coupons.module";
import { DeliveryPersonsModule } from "./apps/delivery-persons/delivery-persons.module";

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
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
    NotificationsModule,
    AuthModule,
    SettingsModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    CouponsModule,
    CustomersModule,
    MeModule,
    OrdersModule,
    DeliveryPersonsModule,
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
