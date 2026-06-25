import { Module } from "@nestjs/common";
import { AdminInventoryListener } from "./inventory.listener";

@Module({
  providers: [AdminInventoryListener],
})
export class AdminInventoryModule {}
