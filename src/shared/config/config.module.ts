import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import {
  adminConfig,
  apiConfig,
  authConfig,
  databaseConfig,
  expoConfig,
  rateLimitConfig,
  storeConfig,
  validationSchema,
} from "./env-config";

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [
        apiConfig,
        databaseConfig,
        authConfig,
        storeConfig,
        adminConfig,
        expoConfig,
        rateLimitConfig,
      ],
      isGlobal: true,
      validationSchema,
    }),
  ],
})
export class ConfigModule {}
