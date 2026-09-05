import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, catchError, throwError } from "rxjs";
import { Request } from "express";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const { method, path } = req;
    const start = Date.now();

    return next.handle().pipe(
      catchError((err: unknown) => {
        const ms = Date.now() - start;
        const status =
          err instanceof Error && "status" in err
            ? (err as { status: number }).status
            : 500;
        this.logger.error(
          `${method} ${path} ${status} ${ms}ms`,
          err instanceof Error ? err.stack : undefined,
        );
        return throwError(() => err);
      }),
    );
  }
}
