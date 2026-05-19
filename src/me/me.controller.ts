import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { MeService } from "./me.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import {
  AddAddressDto,
  InitMeDto,
  MeDto,
  RemoveAddressDto,
  UpdateMeDto,
} from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("me")
@UseGuards(AccessTokenGuard)
@Serialize(MeDto)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Patch()
  updateMe(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: UpdateMeDto,
  ) {
    return this.meService.updateMe(session.customerId!, dto);
  }

  @Put("init")
  initMe(@CurrentSession() session: ICurrentSession, @Body() dto: InitMeDto) {
    return this.meService.initMe(session.customerId!, dto);
  }

  @Post("address")
  addAddress(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: AddAddressDto,
  ) {
    return this.meService.addAddress(session.customerId!, dto);
  }

  @Delete("address/:addressId")
  removeAddress(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: RemoveAddressDto,
  ) {
    return this.meService.removeAddress(session.customerId!, dto);
  }

  @Get()
  findMe(@CurrentSession() session: ICurrentSession) {
    return this.meService.findMe(session.customerId!);
  }

  @Delete()
  async deleteMe(@CurrentSession() session: ICurrentSession) {
    await this.meService.deleteMe(session.customerId!);
  }
}
