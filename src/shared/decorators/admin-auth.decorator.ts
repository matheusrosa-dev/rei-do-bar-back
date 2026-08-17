import { UseGuards, applyDecorators } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";
import { Public } from "./public.decorator";

export const AdminAuth = () =>
  applyDecorators(Public(), UseGuards(AdminBasicAuthGuard));
