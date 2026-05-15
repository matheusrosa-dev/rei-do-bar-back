import { HttpException, HttpStatus } from "@nestjs/common";

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }

  get httpStatus(): HttpStatus {
    return this.getStatus() as HttpStatus;
  }

  static readonly errorCodes = {
    cart: {
      PRODUCT_NOT_FOUND: "CART_001",
      PRODUCT_ALREADY_IN_CART: "CART_002",
      ANONYMOUS_CUSTOMER_NOT_FOUND: "CART_003",
      CART_NOT_FOUND: "CART_004",
      PRODUCT_NOT_FOUND_IN_CART: "CART_005",
      PRODUCT_OUT_OF_STOCK: "CART_006",
      CUSTOMER_NOT_FOUND: "CART_007",
    },
    auth: {
      ANONYMOUS_CUSTOMER_NOT_FOUND: "AUTH_001",
      INVALID_VERIFICATION_CODE: "AUTH_002",
      INACTIVE_CUSTOMER: "AUTH_003",
      INVALID_REFRESH_TOKEN: "AUTH_004",
      CUSTOMER_NOT_FOUND: "AUTH_005",
      INVALID_TOKEN_IN_DECORATOR: "AUTH_006",
    },
  };

  static readonly HttpStatus = HttpStatus;
}
