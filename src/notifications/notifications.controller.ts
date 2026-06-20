import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { RegisterTokenDto } from "./dtos";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post("token")
  @UseGuards(AccessTokenGuard)
  async registerToken(
    @CurrentSession() session: ICurrentSession,
    @Body() body: RegisterTokenDto,
  ) {
    return this.notificationsService.registerToken(session, body);
  }
}
