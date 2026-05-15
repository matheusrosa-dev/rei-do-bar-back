import { Controller, Get, Query } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { ProductsDto } from "./dtos";
import type { ICurrentSession } from "@shared/types/jwt";

@Controller("products")
@Serialize(ProductsDto)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("best-sellers")
  findBestSellers(
    @CurrentSession() session: ICurrentSession,
    @Query("category") category?: string,
  ) {
    return this.productsService.findBestSellers(session, category);
  }
}
