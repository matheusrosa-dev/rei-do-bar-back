import { AuthGuard } from "@nestjs/passport";
import { ExecutionContext } from "@nestjs/common";

export class RefreshTokenGuard extends AuthGuard("jwt-refresh") {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as boolean;
  }
}
