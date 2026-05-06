import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { IApiConfig } from "./config/env-config.interface";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get<ConfigService>(ConfigService);
  const api = config.get<IApiConfig>("api")!;

  await app.listen(api.port);
}
bootstrap();
