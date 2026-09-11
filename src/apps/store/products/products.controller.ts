import { Controller, Get, Query } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { ProductsDto, SearchProductsDto } from "./dtos";
import type { ICurrentSession } from "@shared/types/jwt";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("products")
@StoreAuth("deviceId")
@Serialize(ProductsDto)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("catalog")
  findCatalog(@CurrentSession() session: ICurrentSession) {
    return this.productsService.findCatalog(session);
  }

  @Get("search")
  search(
    @CurrentSession() session: ICurrentSession,
    @Query() dto: SearchProductsDto,
  ) {
    return this.productsService.search(session, dto);
  }
}
