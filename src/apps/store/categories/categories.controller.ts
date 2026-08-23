import { Controller, Get } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { CategoriesDto } from "./dtos";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("categories")
@Serialize(CategoriesDto)
@StoreAuth("basic")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
