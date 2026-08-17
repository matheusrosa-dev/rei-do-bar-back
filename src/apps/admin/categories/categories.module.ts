import { Module } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { AdminCategoriesController } from "./categories.controller";
import { AdminCategoriesService } from "./categories.service";

@Module({
  controllers: [AdminCategoriesController],
  providers: [AdminCategoriesService, AdminBasicAuthGuard],
})
export class AdminCategoriesModule {}
