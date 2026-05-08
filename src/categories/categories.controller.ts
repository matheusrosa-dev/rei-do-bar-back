import { Controller, Get } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { Serialize } from "../shared/interceptors/serialize.interceptor";
import { CategoriesDto } from "./dtos";

@Controller("categories")
@Serialize(CategoriesDto)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
