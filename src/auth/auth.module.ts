import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AccessTokenStrategy, RefreshTokenStrategy } from "./strategies";
import { CustomersModule } from "../customers/customers.module";

@Module({
  imports: [CustomersModule],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenStrategy, RefreshTokenStrategy],
})
export class AuthModule {}
