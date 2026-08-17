import { Module } from "@nestjs/common";
import { AdminInventoryListener } from "./inventory.listener";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminInventoryController } from "./inventory.controller";
import { AdminInventoryService } from "./inventory.service";

@Module({
  controllers: [AdminInventoryController],
  providers: [
    AdminInventoryListener,
    AdminInventoryService,
    AdminBasicAuthGuard,
  ],
})
export class AdminInventoryModule {}
