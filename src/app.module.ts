import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { CartModule } from "./cart/cart.module";
import { APP_GUARD } from "@nestjs/core";
import { DeviceIdGuard } from "./shared/guards/device-id.guard";

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
  ],
})
export class AppModule {}
