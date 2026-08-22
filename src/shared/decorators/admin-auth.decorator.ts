import { UseGuards } from "@nestjs/common";
import { AdminBasicAuthGuard } from "@shared/guards/admin-basic-auth.guard";

export const AdminAuth = () => UseGuards(AdminBasicAuthGuard);
