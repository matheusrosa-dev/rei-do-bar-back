import { HttpException, HttpStatus } from "@nestjs/common";
import { AppException } from "../app.exception";

describe("AppException", () => {
  it("should be defined", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
      "Produto não encontrado",
      AppException.HttpStatus.NOT_FOUND,
    );

    expect(exception).toBeDefined();
  });

  it("should store the error code in the code property", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
      "Produto não encontrado",
      HttpStatus.NOT_FOUND,
    );

    expect(exception.code).toBe("CART_001");
  });

  it("should expose the HTTP status via httpStatus getter", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
      "Produto não encontrado",
      HttpStatus.NOT_FOUND,
    );

    expect(exception.httpStatus).toBe(HttpStatus.NOT_FOUND);
  });

  it("should include code and message in the response body", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
      "Produto não encontrado",
      HttpStatus.NOT_FOUND,
    );

    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe("CART_001");
    expect(response.message).toBe("Produto não encontrado");
  });

  it("should extend HttpException", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
      "Produto não encontrado",
      HttpStatus.NOT_FOUND,
    );

    expect(exception).toBeInstanceOf(HttpException);
  });
});
