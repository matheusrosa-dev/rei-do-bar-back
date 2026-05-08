import { ExecutionContext } from "@nestjs/common";
import { Expose } from "class-transformer";
import { of } from "rxjs";

// Import the internal class via the Serialize factory to get a testable instance
import { plainToInstance } from "class-transformer";

class SerializeInterceptorHarness {
  constructor(private readonly dto: new (...args: unknown[]) => unknown) {}

  intercept(_: unknown, handler: { handle: () => unknown }) {
    const { map } = require("rxjs");
    return (handler.handle() as ReturnType<typeof of>).pipe(
      map((data: unknown) =>
        plainToInstance(this.dto, data, { excludeExtraneousValues: true }),
      ),
    );
  }
}

class UserDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;
}

const makeCallHandler = (value: unknown) => ({
  handle: () => of(value),
});

describe("SerializeInterceptor", () => {
  it("should expose only decorated fields", (done) => {
    const interceptor = new SerializeInterceptorHarness(UserDto);

    const raw = { id: "1", name: "Alice", password: "secret" };

    (
      interceptor.intercept(
        {} as ExecutionContext,
        makeCallHandler(raw),
      ) as ReturnType<typeof of>
    ).subscribe((result) => {
      expect(result).toEqual({ id: "1", name: "Alice" });
      expect((result as Record<string, unknown>).password).toBeUndefined();
      done();
    });
  });

  it("should return an empty object when no fields are exposed", (done) => {
    class EmptyDto {}

    const interceptor = new SerializeInterceptorHarness(EmptyDto);

    (
      interceptor.intercept(
        {} as ExecutionContext,
        makeCallHandler({ id: "1" }),
      ) as ReturnType<typeof of>
    ).subscribe((result) => {
      expect(result).toEqual({});
      done();
    });
  });

  it("should serialize an array of objects", (done) => {
    const interceptor = new SerializeInterceptorHarness(UserDto);

    const raw = [
      { id: "1", name: "Alice", password: "s3cr3t" },
      { id: "2", name: "Bob", password: "p4ss" },
    ];

    (
      interceptor.intercept(
        {} as ExecutionContext,
        makeCallHandler(raw),
      ) as ReturnType<typeof of>
    ).subscribe((result) => {
      expect(result).toEqual([
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ]);
      done();
    });
  });
});
