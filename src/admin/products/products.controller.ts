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
import { ProductsService } from "./products.service";
import {
  ToggleStatusProductDto,
  FindAllProductsDto,
  FindByIdDto,
  UpdateProductBodyDto,
  UpdateProductParamsDto,
  UpdateStockProductParamsDto,
  UpdateStockProductBodyDto,
  DeleteProductDto,
  CreateProductDto,
} from "./dtos";

@Controller("admin/products")
@AdminAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() dto: FindAllProductsDto) {
    return this.productsService.findAll(dto);
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

  @Patch(":productId/increment-stock")
  incrementStock(
    @Param() { productId }: UpdateStockProductParamsDto,
    @Body() dto: UpdateStockProductBodyDto,
  ) {
    return this.productsService.incrementStock(productId, dto.amount);
  }

  @Patch(":productId/decrement-stock")
  decrementStock(
    @Param() { productId }: UpdateStockProductParamsDto,
    @Body() dto: UpdateStockProductBodyDto,
  ) {
    return this.productsService.decrementStock(productId, dto.amount);
  }

  @Delete(":productId")
  removeProduct(@Param() { productId }: DeleteProductDto) {
    return this.productsService.removeProduct(productId);
  }
}
