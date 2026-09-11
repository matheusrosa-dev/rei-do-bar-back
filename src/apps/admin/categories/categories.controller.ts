import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminCategoriesService } from "./categories.service";
import {
  CreateCategoryDto,
  DeleteCategoryDto,
  FindOneCategoryDto,
  ToggleStatusCategoryDto,
  UpdateCategoryBodyDto,
  UpdateCategoryParamsDto,
} from "./dtos";

@Controller("admin/categories")
@AdminAuth()
export class AdminCategoriesController {
  constructor(private readonly categoriesService: AdminCategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(":categoryId")
  findOne(@Param() { categoryId }: FindOneCategoryDto) {
    return this.categoriesService.findOne(categoryId);
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
