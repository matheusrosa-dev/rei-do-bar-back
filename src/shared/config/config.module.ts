import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { apiConfig, databaseConfig, validationSchema } from "./env-config";

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [apiConfig, databaseConfig],
      isGlobal: true,
      validationSchema,
    }),
  ],
})
export class ConfigModule {}
