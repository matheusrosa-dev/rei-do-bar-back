import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { RegisterTokenDto } from "./dtos";
import { StoreAuth } from "@shared/decorators/store-auth.decorator";

@Controller("notifications")
@StoreAuth("accessToken")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post("token")
  async registerToken(
    @CurrentSession() session: ICurrentSession,
    @Body() body: RegisterTokenDto,
  ) {
    return this.notificationsService.registerToken(session, body);
  }

  @Delete("token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeToken(@CurrentSession() session: ICurrentSession) {
    await this.notificationsService.revokeToken(session);
  }
}
