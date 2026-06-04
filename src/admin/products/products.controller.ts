import { Controller, Get, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { ProductsService } from "./products.service";
import { FindAllProductsDto } from "./dtos";

@Controller("admin/products")
@AdminAuth()
// TODO: adicionar serialize
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() dto: FindAllProductsDto) {
    return this.productsService.findAll(dto);
  }
}
