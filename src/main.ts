import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { IApiConfig } from "./shared/config/env-config.interface";
import { applyGlobalConfig } from "./shared/config/global-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get<ConfigService>(ConfigService);
  const api = config.get<IApiConfig>("api")!;

  applyGlobalConfig(app);

  await app.listen(api.port);
}
bootstrap();
