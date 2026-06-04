import { UseGuards, applyDecorators } from "@nestjs/common";
import { BasicAuthGuard } from "@shared/guards/basic-auth.guard";
import { Public } from "./public.decorator";

export const AdminAuth = () =>
  applyDecorators(Public(), UseGuards(BasicAuthGuard));
