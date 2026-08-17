import {
  Body,
  Controller,
  Delete,
  Param,
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
  MeDto,
  RemoveAddressDto,
  SetMainAddressDto,
  UpdateAddressDto,
} from "./dtos";
import { Serialize } from "@shared/interceptors/serialize.interceptor";

@Controller("me/address")
@UseGuards(AccessTokenGuard)
@Serialize(MeDto)
export class AddressController {
  constructor(private readonly meService: MeService) {}

  @Post()
  addAddress(
    @CurrentSession() session: ICurrentSession,
    @Body() dto: AddAddressDto,
  ) {
    return this.meService.addAddress(session.customerId!, dto);
  }

  @Put(":addressId")
  updateAddress(
    @CurrentSession() session: ICurrentSession,
    @Param() param: RemoveAddressDto,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.meService.updateAddress(
      session.customerId!,
      param.addressId,
      dto,
    );
  }

  @Put(":addressId/main")
  setMainAddress(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: SetMainAddressDto,
  ) {
    return this.meService.setMainAddress(session.customerId!, dto);
  }

  @Delete(":addressId")
  removeAddress(
    @CurrentSession() session: ICurrentSession,
    @Param() dto: RemoveAddressDto,
  ) {
    return this.meService.removeAddress(session.customerId!, dto);
  }
}
