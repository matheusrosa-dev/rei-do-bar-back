import { Controller, Get, UseGuards } from "@nestjs/common";
import { CouponsService } from "./coupons.service";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import type { ICurrentSession } from "@shared/types/jwt";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import { CouponsDto } from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("coupons")
@Serialize(CouponsDto)
@UseGuards(AccessTokenGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  findAvailableCoupons(@CurrentSession() session: ICurrentSession) {
    return this.couponsService.findAvailableCoupons(session.customerId!);
  }
}
