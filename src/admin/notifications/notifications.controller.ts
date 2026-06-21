import { Body, Controller, Post } from "@nestjs/common";
import { AdminAuth } from "@shared/decorators/admin-auth.decorator";

import { AdminNotificationsService } from "./notifications.service";
import { PushNotificationDto } from "./dtos";

@Controller("admin/notifications")
@AdminAuth()
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
  ) {}

  @Post()
  pushNotification(@Body() body: PushNotificationDto) {
    this.notificationsService.pushNotification(body);
  }
}
