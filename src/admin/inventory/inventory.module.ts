import { Module } from "@nestjs/common";
import { AdminInventoryListener } from "./inventory.listener";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminInventoryController } from "./inventory.controller";
import { AdminInventoryService } from "./inventory.service";

@Module({
  controllers: [AdminInventoryController],
  providers: [AdminInventoryListener, AdminInventoryService, BasicAuthGuard],
})
export class AdminInventoryModule {}
