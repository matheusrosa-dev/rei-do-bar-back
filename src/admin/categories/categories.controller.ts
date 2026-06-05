import { Controller, Get } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { CategoriesService } from "./categories.service";

@Controller("admin/categories")
@AdminAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
