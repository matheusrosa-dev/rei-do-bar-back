import { Module } from "@nestjs/common";
import { AdminCategoryGroupsController } from "./category-groups.controller";
import { AdminCategoryGroupsService } from "./category-groups.service";

@Module({
  controllers: [AdminCategoryGroupsController],
  providers: [AdminCategoryGroupsService],
})
export class AdminCategoryGroupsModule {}
