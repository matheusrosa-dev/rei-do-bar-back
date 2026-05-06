import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";

@Injectable()
export class WrapperDataInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((body) => {
        if (!body || "data" in body) {
          return body;
        }

        return {
          data: body,
        };
      }),
    );
  }
}
