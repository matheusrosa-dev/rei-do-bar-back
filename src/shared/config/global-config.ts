import { INestApplication, ValidationPipe } from "@nestjs/common";
import { LoggingInterceptor } from "../interceptors/logging.interceptor";
import { WrapperDataInterceptor } from "../interceptors/wrapper-data.interceptor";
import { GlobalExceptionFilter } from "../filters/exception.filter";

export function applyGlobalConfig(app: INestApplication) {
  app.enableCors({
    origin: "*",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: 422,
      transform: true,
      whitelist: true,
    }),
  );

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new WrapperDataInterceptor(),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
}
