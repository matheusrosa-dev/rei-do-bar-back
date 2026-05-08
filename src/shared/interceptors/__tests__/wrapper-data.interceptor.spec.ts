import { ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";
import { WrapperDataInterceptor } from "../wrapper-data.interceptor";

const makeCallHandler = (value: unknown) => ({
  handle: () => of(value),
});

describe("WrapperDataInterceptor", () => {
  let interceptor: WrapperDataInterceptor;

  beforeEach(() => {
    interceptor = new WrapperDataInterceptor();
  });

  it("should be defined", () => {
    expect(interceptor).toBeDefined();
  });

  it("should wrap the response body in a data property", (done) => {
    const body = { id: "1", name: "Product" };

    interceptor
      .intercept({} as ExecutionContext, makeCallHandler(body))
      .subscribe((result) => {
        expect(result).toEqual({ data: body });
        done();
      });
  });

  it("should not wrap when body already has a data property", (done) => {
    const body = { data: [1, 2, 3] };

    interceptor
      .intercept({} as ExecutionContext, makeCallHandler(body))
      .subscribe((result) => {
        expect(result).toEqual(body);
        done();
      });
  });

  it("should not wrap when body is null", (done) => {
    interceptor
      .intercept({} as ExecutionContext, makeCallHandler(null))
      .subscribe((result) => {
        expect(result).toBeNull();
        done();
      });
  });

  it("should not wrap when body is undefined", (done) => {
    interceptor
      .intercept({} as ExecutionContext, makeCallHandler(undefined))
      .subscribe((result) => {
        expect(result).toBeUndefined();
        done();
      });
  });

  it("should wrap arrays in data property", (done) => {
    const body = [1, 2, 3];

    interceptor
      .intercept({} as ExecutionContext, makeCallHandler(body))
      .subscribe((result) => {
        expect(result).toEqual({ data: body });
        done();
      });
  });
});
