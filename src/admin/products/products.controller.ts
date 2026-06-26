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
import { AdminProductsService } from "./products.service";
import {
  ToggleStatusProductDto,
  FindAllProductsDto,
  FindByIdDto,
  UpdateProductBodyDto,
  UpdateProductParamsDto,
  DeleteProductDto,
  CreateProductDto,
  UpdateProductsOrderDto,
} from "./dtos";

@Controller("admin/products")
@AdminAuth()
export class AdminProductsController {
  constructor(private readonly productsService: AdminProductsService) {}

  @Get()
  findAll(@Query() dto: FindAllProductsDto) {
    if (dto?.simple) {
      return this.productsService.findAllSimple();
    }

    return this.productsService.findAll(dto);
  }

  @Get("sort-order")
  findAllToSort() {
    return this.productsService.findAllToSort();
  }

  @Put("sort-order")
  updateProductsOrder(@Body() dto: UpdateProductsOrderDto) {
    return this.productsService.updateProductsOrder(dto);
  }

  @Get(":productId")
  findById(@Param() { productId }: FindByIdDto) {
    return this.productsService.findById(productId);
  }

  @Put(":productId")
  update(
    @Param() { productId }: UpdateProductParamsDto,
    @Body() bodyDto: UpdateProductBodyDto,
  ) {
    return this.productsService.updateProduct(productId, bodyDto);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Patch(":productId/activate")
  activateProduct(@Param() { productId }: ToggleStatusProductDto) {
    return this.productsService.activateProduct(productId);
  }

  @Patch(":productId/deactivate")
  deactivateProduct(@Param() { productId }: ToggleStatusProductDto) {
    return this.productsService.deactivateProduct(productId);
  }

  @Delete(":productId")
  removeProduct(@Param() { productId }: DeleteProductDto) {
    return this.productsService.removeProduct(productId);
  }
}
