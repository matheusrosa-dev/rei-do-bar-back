import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import {
  apiConfig,
  authConfig,
  databaseConfig,
  validationSchema,
} from "./env-config";

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [apiConfig, databaseConfig, authConfig],
      isGlobal: true,
      validationSchema,
    }),
  ],
})
export class ConfigModule {}
