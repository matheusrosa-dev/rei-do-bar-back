import { Controller, Get } from "@nestjs/common";
import { CouponsService } from "./coupons.service";
import type { ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { CouponsDto } from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("coupons")
@Serialize(CouponsDto)
@StoreAuth("accessToken")
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  findAvailableCoupons(@CurrentSession() session: ICurrentSession) {
    return this.couponsService.findAvailableCoupons(session.customerId!);
  }
}
