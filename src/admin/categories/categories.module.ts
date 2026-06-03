import { Module } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, BasicAuthGuard],
})
export class CategoriesModule {}
