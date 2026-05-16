import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, delay } from "rxjs";

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(private readonly ms: number) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (this.ms <= 0) {
      return next.handle();
    }

    return next.handle().pipe(delay(this.ms));
  }
}
