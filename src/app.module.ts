import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
})
export class AppModule {}
