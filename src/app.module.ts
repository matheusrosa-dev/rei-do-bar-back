import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { DatabaseModule } from "./database/database.module";
import { ConfigModule } from "./config/config.module";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AppController],
})
export class AppModule {}
