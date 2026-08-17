import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";

import { AdminInventoryService } from "./inventory.service";
import {
  DecrementInventoryDto,
  FindAllMovementsDto,
  IncrementInventoryDto,
} from "./dtos";

@Controller("admin/inventory")
@AdminAuth()
export class AdminInventoryController {
  constructor(private readonly adminInventoryService: AdminInventoryService) {}

  @Get("movements")
  listMovements(@Query() dto: FindAllMovementsDto) {
    return this.adminInventoryService.listMovements(dto);
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
