import { Controller, Get } from "@nestjs/common";
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
  findBestSellers(@CurrentSession() session: ICurrentSession) {
    return this.productsService.findBestSellers(session.deviceId);
  }
}
