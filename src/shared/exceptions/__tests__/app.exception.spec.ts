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
      AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
      "Produto já no carrinho",
      HttpStatus.BAD_REQUEST,
    );

    expect(exception.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });

  it("should include code and message in the response body", () => {
    const exception = new AppException(
      AppException.errorCodes.auth.INACTIVE_CUSTOMER,
      "Cliente inativo",
      HttpStatus.BAD_REQUEST,
    );

    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe("AUTH_001");
    expect(response.message).toBe("Cliente inativo");
  });

  it("should extend HttpException", () => {
    const exception = new AppException(
      AppException.errorCodes.cart.CUSTOMER_CART_NOT_FOUND,
      "Carrinho não encontrado",
      HttpStatus.BAD_REQUEST,
    );

    expect(exception).toBeInstanceOf(HttpException);
  });
});
