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
      CUSTOMER_NOT_FOUND: "CART_003",
      CUSTOMER_CART_NOT_FOUND: "CART_004",
      PRODUCT_NOT_FOUND_IN_CART: "CART_005",
      PRODUCT_OUT_OF_STOCK: "CART_006",
    },
    auth: {
      CUSTOMER_NOT_FOUND: "AUTH_001",
      INVALID_VERIFICATION_CODE: "AUTH_002",
      INACTIVE_CUSTOMER: "AUTH_003",
    },
  };

  static readonly HttpStatus = HttpStatus;
}
