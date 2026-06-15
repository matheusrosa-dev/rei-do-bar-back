import { Controller, Get } from "@nestjs/common";
import { Serialize } from "@shared/interceptors/serialize.interceptor";
import { SettingsService } from "./settings.service";
import { SettingsDto } from "./dtos";

@Controller("settings")
@Serialize(SettingsDto)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }
}
