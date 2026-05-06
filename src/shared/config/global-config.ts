import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { WrapperDataInterceptor } from "../interceptors/wrapper-data.interceptor";

export function applyGlobalConfig(app: INestApplication) {
  app.enableCors({
    origin: "*",
    credentials: true,
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: 422,
      transform: true,
      whitelist: true,
    }),
  );

  app.useGlobalInterceptors(new WrapperDataInterceptor());
}
