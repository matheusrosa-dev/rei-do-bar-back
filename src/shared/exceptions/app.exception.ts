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
      PRODUCT_INACTIVE: "CART_008",
    },
    auth: {
      ANONYMOUS_CUSTOMER_NOT_FOUND: "AUTH_001",
      INVALID_VERIFICATION_CODE: "AUTH_002",
      INACTIVE_CUSTOMER: "AUTH_003",
      INVALID_REFRESH_TOKEN: "AUTH_004",
      CUSTOMER_NOT_FOUND: "AUTH_005",
      INVALID_TOKEN_IN_DECORATOR: "AUTH_006",
    },
    me: {
      CUSTOMER_NOT_FOUND: "ME_001",
      NO_FIELDS_TO_UPDATE: "ME_002",
      ADDRESS_ALREADY_EXISTS: "ME_003",
      ADDRESS_NOT_FOUND: "ME_004",
      ALREADY_INITIALIZED: "ME_005",
      CANNOT_REMOVE_MAIN_ADDRESS: "ME_006",
      LIMITED_NUMBER_OF_ADDRESSES: "ME_007",
      ADDRESS_ALREADY_MAIN: "ME_008",
    },
    order: {
      CUSTOMER_NOT_FOUND: "ORDER_001",
      CUSTOMER_NOT_INITIALIZED: "ORDER_002",
      CART_EMPTY: "ORDER_003",
      ONGOING_ORDER: "ORDER_004",
      PRODUCTS_OUT_OF_STOCK: "ORDER_005",
      PRODUCT_INACTIVE: "ORDER_006",
      ORDER_NOT_FOUND: "ORDER_007",
      ORDER_NOT_CANCELLABLE: "ORDER_008",
      NO_MAIN_ADDRESS: "ORDER_009",
    },
    products: {
      INVALID_SESSION: "PRODUCTS_001",
    },
    adminProducts: {
      INSUFFICIENT_STOCK: "ADMIN_PRODUCTS_001",
    },
    settings: {
      DELIVERY_FEE_NOT_CONFIGURED: "SETTINGS_001",
    },
  };

  static readonly HttpStatus = HttpStatus;
}
