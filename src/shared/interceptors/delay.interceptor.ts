import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, delay } from "rxjs";

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(private readonly ms: number = 2000) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(delay(this.ms));
  }
}
