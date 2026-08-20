import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";

import { AdminNotificationsService } from "./notifications.service";
import { FindAllNotificationsDto, PushNotificationDto } from "./dtos";

@Controller("admin/notifications")
@AdminAuth()
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
  ) {}

  @Get()
  findAll(@Query() dto: FindAllNotificationsDto) {
    return this.notificationsService.findAll(dto);
  }

  @Post()
  pushNotification(@Body() body: PushNotificationDto) {
    this.notificationsService.pushNotification(body);
  }
}
