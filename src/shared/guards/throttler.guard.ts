import { ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerLimitDetail } from "@nestjs/throttler";
import { AppException } from "@shared/exceptions/app.exception";

export abstract class BaseThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new AppException(
      AppException.errorCodes.auth.RATE_LIMIT_EXCEEDED,
      "Muitas tentativas. Aguarde um momento e tente novamente.",
      AppException.HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
