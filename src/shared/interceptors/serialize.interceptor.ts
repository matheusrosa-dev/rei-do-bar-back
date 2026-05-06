import { CallHandler, NestInterceptor, UseInterceptors } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { Observable, map } from "rxjs";

interface ClassConstructor {
  new (...args: unknown[]): unknown;
}

class SerializeInterceptor implements NestInterceptor {
  constructor(private readonly dto: ClassConstructor) {}

  intercept(_, handler: CallHandler): Observable<unknown> {
    return handler.handle().pipe(
      map((data: unknown) => {
        return plainToInstance(this.dto, data, {
          excludeExtraneousValues: true,
        });
      }),
    );
  }
}

export const Serialize = (dto: ClassConstructor) => {
  return UseInterceptors(new SerializeInterceptor(dto));
};
