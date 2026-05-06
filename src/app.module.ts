import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";

@Module({
  imports: [ConfigModule, DatabaseModule],
})
export class AppModule {}
