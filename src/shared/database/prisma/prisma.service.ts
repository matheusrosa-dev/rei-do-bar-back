import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
import { ConfigService } from "@nestjs/config";
import { IDatabaseConfig } from "../../config/env-config.interface";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const database = configService.get<IDatabaseConfig>("database")!;

    const adapter = new PrismaPg({
      connectionString: database.url,
    });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$executeRaw`SELECT 1`; // Test the connection
    } catch (error) {
      this.logger.error("Failed to connect to the database", error);

      throw new InternalServerErrorException(
        "Failed to connect to the database",
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
