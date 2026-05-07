import { Controller, Get, Headers } from "@nestjs/common";
import { ProductsService } from "./products.service";

//TODO: adicionar serialize
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("best-sellers")
  // TODO: adicionar decorator para pegar o deviceId do header
  findBestSellers(@Headers("x-device-id") deviceId: string) {
    console.log("Device ID:", deviceId);
    return this.productsService.findBestSellers(deviceId);
  }
}
