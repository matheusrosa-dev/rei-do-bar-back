import { Body, Controller, Get, Param, Patch, Put } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";
import { SettingsService } from "./settings.service";
import {
  ToggleStatusSettingDto,
  UpdateSettingBodyDto,
  UpdateSettingParamsDto,
} from "./dtos";

@Controller("admin/settings")
@AdminAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Put(":settingKey")
  updateSetting(
    @Param() { settingKey }: UpdateSettingParamsDto,
    @Body() body: UpdateSettingBodyDto,
  ) {
    return this.settingsService.updateSetting(settingKey, body);
  }

  @Patch(":settingKey/activate")
  activateSetting(@Param() { settingKey }: ToggleStatusSettingDto) {
    return this.settingsService.activateSetting(settingKey);
  }

  @Patch(":settingKey/deactivate")
  deactivateSetting(@Param() { settingKey }: ToggleStatusSettingDto) {
    return this.settingsService.deactivateSetting(settingKey);
  }
}
