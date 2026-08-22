import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { DatabaseModule } from "./shared/database/database.module";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DelayInterceptor } from "@shared/interceptors/delay.interceptor";
import { ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import {
  IApiConfig,
  IRateLimitConfig,
} from "@shared/config/env-config.interface";
import { THROTTLER_NAMES } from "@shared/decorators/throttle.decorator";
import { AdminModule } from "./apps/admin/admin.module";
import { DeliveryPersonsModule } from "./apps/delivery-persons/delivery-persons.module";
import { StoreModule } from "./apps/store/store.module";

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rateLimit = configService.get<IRateLimitConfig>("rateLimit")!;

        return {
          throttlers: THROTTLER_NAMES.map((name) => ({
            name,
            ...rateLimit[name],
          })),
        };
      },
    }),
    DatabaseModule,
    StoreModule,
    DeliveryPersonsModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const api = configService.get<IApiConfig>("api")!;

        return new DelayInterceptor(api.delay);
      },
    },
  ],
})
export class AppModule {}
