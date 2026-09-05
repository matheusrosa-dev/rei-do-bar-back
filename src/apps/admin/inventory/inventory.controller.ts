import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";

import { AdminInventoryService } from "./inventory.service";
import {
  DecrementInventoryDto,
  FindAllMovementsDto,
  IncrementInventoryDto,
  MovementParamsDto,
  UpdateMovementBodyDto,
} from "./dtos";

@Controller("admin/inventory")
@AdminAuth()
export class AdminInventoryController {
  constructor(private readonly adminInventoryService: AdminInventoryService) {}

  @Get("movements")
  listMovements(@Query() dto: FindAllMovementsDto) {
    return this.adminInventoryService.listMovements(dto);
  }

  @Put("movements/:movementId")
  updateRestockMovement(
    @Param() { movementId }: MovementParamsDto,
    @Body() body: UpdateMovementBodyDto,
  ) {
    return this.adminInventoryService.updateRestockMovement(movementId, body);
  }

  @Delete("movements/:movementId")
  revertRestockMovement(@Param() { movementId }: MovementParamsDto) {
    return this.adminInventoryService.revertRestockMovement(movementId);
  }

  @Post("increment")
  incrementInventory(@Body() body: IncrementInventoryDto) {
    return this.adminInventoryService.incrementInventory(body);
  }

  @Post("decrement")
  decrementInventory(@Body() body: DecrementInventoryDto) {
    return this.adminInventoryService.decrementInventory(body);
  }
}
