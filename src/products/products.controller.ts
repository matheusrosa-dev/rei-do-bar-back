import { Controller, Get, Query } from "@nestjs/common";
import { ProductsService } from "./products.service";
import {
  CurrentSession,
  type ICurrentSession,
} from "@shared/decorators/current-session.decorator";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { ProductsDto } from "./dtos";

@Controller("products")
@Serialize(ProductsDto)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("best-sellers")
  findBestSellers(
    @CurrentSession() session: ICurrentSession,
    @Query("category") category?: string,
  ) {
    return this.productsService.findBestSellers(session.deviceId, category);
  }
}
