import { Controller, Get } from "@nestjs/common";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { SettingsService } from "./settings.service";
import { SettingsDto } from "./dtos";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("settings")
@Serialize(SettingsDto)
@StoreAuth("basic")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }
}
