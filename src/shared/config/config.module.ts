import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import {
  adminConfig,
  apiConfig,
  authConfig,
  databaseConfig,
  expoConfig,
  rateLimitConfig,
  validationSchema,
} from "./env-config";

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [
        apiConfig,
        databaseConfig,
        authConfig,
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
