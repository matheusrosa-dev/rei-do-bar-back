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
import { AdminCategoryGroupsService } from "./category-groups.service";
import {
  CreateCategoryGroupDto,
  DeleteCategoryGroupDto,
  FindOneCategoryGroupDto,
  ToggleStatusCategoryGroupDto,
  UpdateCategoryGroupBodyDto,
  UpdateCategoryGroupParamsDto,
  UpdateCategoryGroupsOrderDto,
} from "./dtos";

@Controller("admin/category-groups")
@AdminAuth()
export class AdminCategoryGroupsController {
  constructor(
    private readonly categoryGroupsService: AdminCategoryGroupsService,
  ) {}

  @Get()
  findAll() {
    return this.categoryGroupsService.findAll();
  }

  @Get(":categoryGroupId")
  findOne(@Param() { categoryGroupId }: FindOneCategoryGroupDto) {
    return this.categoryGroupsService.findOne(categoryGroupId);
  }

  @Put("sort-order")
  updateCategoryGroupsOrder(@Body() dto: UpdateCategoryGroupsOrderDto) {
    return this.categoryGroupsService.updateCategoryGroupsOrder(dto);
  }

  @Post()
  createCategoryGroup(@Body() dto: CreateCategoryGroupDto) {
    return this.categoryGroupsService.createCategoryGroup(dto);
  }

  @Put(":categoryGroupId")
  updateCategoryGroup(
    @Param() { categoryGroupId }: UpdateCategoryGroupParamsDto,
    @Body() dto: UpdateCategoryGroupBodyDto,
  ) {
    return this.categoryGroupsService.updateCategoryGroup(categoryGroupId, dto);
  }

  @Patch(":categoryGroupId/activate")
  activateCategoryGroup(
    @Param() { categoryGroupId }: ToggleStatusCategoryGroupDto,
  ) {
    return this.categoryGroupsService.activateCategoryGroup(categoryGroupId);
  }

  @Patch(":categoryGroupId/deactivate")
  deactivateCategoryGroup(
    @Param() { categoryGroupId }: ToggleStatusCategoryGroupDto,
  ) {
    return this.categoryGroupsService.deactivateCategoryGroup(categoryGroupId);
  }

  @Delete(":categoryGroupId")
  removeCategoryGroup(@Param() { categoryGroupId }: DeleteCategoryGroupDto) {
    return this.categoryGroupsService.removeCategoryGroup(categoryGroupId);
  }
}
