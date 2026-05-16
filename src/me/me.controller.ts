import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { MeService } from "./me.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { MeDto, UpdateMeDto } from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("me")
@UseGuards(AccessTokenGuard)
@Serialize(MeDto)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMe(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: UpdateMeDto,
  ) {
    return this.meService.updateMe(session.customerId!, dto);
  }

  @Get()
  async findMe(@CurrentSession() session: ICurrentSession) {
    return this.meService.findMe(session.customerId!);
  }
}
