import {
  Body,
  Controller,
  Delete,
  Get,
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
  ToggleStatusDeliveryPersonDto,
  UpdateDeliveryPersonBodyDto,
  UpdateDeliveryPersonParamsDto,
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
