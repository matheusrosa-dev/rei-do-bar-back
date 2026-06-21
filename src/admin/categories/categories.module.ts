import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { AdminCategoriesController } from "./categories.controller";
import { AdminCategoriesService } from "./categories.service";

@Module({
  controllers: [AdminCategoriesController],
  providers: [AdminCategoriesService, BasicAuthGuard],
})
export class AdminCategoriesModule {}
