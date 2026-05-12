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

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
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
