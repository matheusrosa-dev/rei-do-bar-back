import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from './products/products.module';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, CategoriesModule, ProductsModule],
})
export class AppModule {}
