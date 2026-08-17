import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminCategoriesService } from "./categories.service";
import {
  CreateCategoryDto,
  DeleteCategoryDto,
  FindAllCategory,
  ToggleStatusCategoryDto,
  UpdateCategoriesOrderDto,
  UpdateCategoryBodyDto,
  UpdateCategoryParamsDto,
} from "./dtos";

@Controller("admin/categories")
@AdminAuth()
export class AdminCategoriesController {
  constructor(private readonly categoriesService: AdminCategoriesService) {}

  @Get()
  findAll(@Query() dto: FindAllCategory) {
    return this.categoriesService.findAll(dto);
  }

  @Get("sort-order")
  findAllToSort() {
    return this.categoriesService.findAllToSort();
  }

  @Put("sort-order")
  updateCategoriesOrder(@Body() dto: UpdateCategoriesOrderDto) {
    return this.categoriesService.updateCategoriesOrder(dto);
  }

  @Post()
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  @Put(":categoryId")
  updateCategory(
    @Param() { categoryId }: UpdateCategoryParamsDto,
    @Body() dto: UpdateCategoryBodyDto,
  ) {
    return this.categoriesService.updateCategory(categoryId, dto);
  }

  @Patch(":categoryId/activate")
  activateCategory(@Param() { categoryId }: ToggleStatusCategoryDto) {
    return this.categoriesService.activateCategory(categoryId);
  }

  @Patch(":categoryId/deactivate")
  deactivateCategory(@Param() { categoryId }: ToggleStatusCategoryDto) {
    return this.categoriesService.deactivateCategory(categoryId);
  }

  @Delete(":categoryId")
  removeCategory(@Param() { categoryId }: DeleteCategoryDto) {
    return this.categoriesService.removeCategory(categoryId);
  }
}
