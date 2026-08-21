import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { CurrentSession } from "@shared/decorators/current-session.decorator";
import type { ICurrentSession } from "@shared/types/jwt";
import { AccessTokenGuard } from "@shared/guards/access-token.guard";
import { RegisterTokenDto } from "./dtos";

@Controller("notifications")
@UseGuards(AccessTokenGuard)
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
