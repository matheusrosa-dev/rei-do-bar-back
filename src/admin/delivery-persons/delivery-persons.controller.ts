import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { AdminDeliveryPersonsService } from "./delivery-persons.service";
import {
  CreateDeliveryPersonDto,
  DeleteDeliveryPersonDto,
  FindAllDeliveryPersonsDto,
  FindDeliveryPersonByIdDto,
  RevokeDeliveryPersonAccessDto,
  ToggleStatusDeliveryPersonDto,
  UpdateDeliveryPersonBodyDto,
  UpdateDeliveryPersonParamsDto,
  UpdateDeliveryPersonPasswordBodyDto,
  UpdateDeliveryPersonPasswordParamsDto,
} from "./dtos";

@Controller("admin/delivery-persons")
@AdminAuth()
export class AdminDeliveryPersonsController {
  constructor(
    private readonly deliveryPersonsService: AdminDeliveryPersonsService,
  ) {}

  @Get()
  findAll(@Query() dto: FindAllDeliveryPersonsDto) {
    if (dto?.simple) {
      return this.deliveryPersonsService.findAllSimple();
    }

    return this.deliveryPersonsService.findAll(dto);
  }

  @Get(":deliveryPersonId")
  findDeliveryPersonById(
    @Param() { deliveryPersonId }: FindDeliveryPersonByIdDto,
  ) {
    return this.deliveryPersonsService.findDeliveryPersonById(deliveryPersonId);
  }

  @Post()
  createDeliveryPerson(@Body() dto: CreateDeliveryPersonDto) {
    return this.deliveryPersonsService.createDeliveryPerson(dto);
  }

  @Put(":deliveryPersonId")
  updateDeliveryPerson(
    @Param() { deliveryPersonId }: UpdateDeliveryPersonParamsDto,
    @Body() dto: UpdateDeliveryPersonBodyDto,
  ) {
    return this.deliveryPersonsService.updateDeliveryPerson(
      deliveryPersonId,
      dto,
    );
  }

  @Put(":deliveryPersonId/password")
  updateDeliveryPersonPassword(
    @Param() { deliveryPersonId }: UpdateDeliveryPersonPasswordParamsDto,
    @Body() dto: UpdateDeliveryPersonPasswordBodyDto,
  ) {
    return this.deliveryPersonsService.updateDeliveryPersonPassword(
      deliveryPersonId,
      dto,
    );
  }

  @Post("revoke-access")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllDeliveryPersonsAccess() {
    await this.deliveryPersonsService.revokeAllDeliveryPersonsAccess();
  }

  @Post(":deliveryPersonId/revoke-access")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeDeliveryPersonAccess(
    @Param() { deliveryPersonId }: RevokeDeliveryPersonAccessDto,
  ) {
    await this.deliveryPersonsService.revokeDeliveryPersonAccess(
      deliveryPersonId,
    );
  }

  @Patch(":deliveryPersonId/activate")
  activateDeliveryPerson(
    @Param() { deliveryPersonId }: ToggleStatusDeliveryPersonDto,
  ) {
    return this.deliveryPersonsService.activateDeliveryPerson(deliveryPersonId);
  }

  @Patch(":deliveryPersonId/deactivate")
  deactivateDeliveryPerson(
    @Param() { deliveryPersonId }: ToggleStatusDeliveryPersonDto,
  ) {
    return this.deliveryPersonsService.deactivateDeliveryPerson(
      deliveryPersonId,
    );
  }

  @Delete(":deliveryPersonId")
  removeDeliveryPerson(@Param() { deliveryPersonId }: DeleteDeliveryPersonDto) {
    return this.deliveryPersonsService.removeDeliveryPerson(deliveryPersonId);
  }
}
