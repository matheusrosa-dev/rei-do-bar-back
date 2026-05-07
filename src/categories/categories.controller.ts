import { Controller, Get } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { Serialize } from "../shared/interceptors/serialize.interceptor";
import { CategoryDto } from "./dtos";

@Controller("categories")
@Serialize(CategoryDto)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
