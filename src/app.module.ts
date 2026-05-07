import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, CategoriesModule],
})
export class AppModule {}
