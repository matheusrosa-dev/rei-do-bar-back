import { Module } from "@nestjs/common";
import { AdminInventoryListener } from "./inventory.listener";
import { AdminInventoryController } from "./inventory.controller";
import { AdminInventoryService } from "./inventory.service";

@Module({
  controllers: [AdminInventoryController],
  providers: [AdminInventoryListener, AdminInventoryService],
})
export class AdminInventoryModule {}
