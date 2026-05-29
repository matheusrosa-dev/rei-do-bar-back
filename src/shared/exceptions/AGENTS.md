# AGENTS.md — src/shared/exceptions/

## `AppException`

The **only exception class** used in application code. Extends NestJS's `HttpException`.

```typescript
throw new AppException(
  AppException.errorCodes.cart.PRODUCT_NOT_FOUND,  // code string
  "Produto não encontrado",                          // user-facing message (pt-BR)
  AppException.HttpStatus.NOT_FOUND,                // HTTP status (re-export of HttpStatus)
);
```

### Response Shape

`GlobalExceptionFilter` catches all `HttpException` instances and returns:

```json
{ "code": "CART_001", "message": "Produto não encontrado" }
```

For uncaught errors (non-`HttpException`), the filter returns:

```json
{ "code": "INTERNAL_ERROR", "message": "Erro interno do servidor" }
```

---

## Error Code Registry

Error codes are namespaced by domain on `AppException.errorCodes`. This is the **authoritative list** — add new codes here when introducing new failure cases.

### `cart`

| Constant | Code | HTTP |
|---|---|---|
| `PRODUCT_NOT_FOUND` | `CART_001` | 404 |
| `PRODUCT_ALREADY_IN_CART` | `CART_002` | 400 |
| `ANONYMOUS_CUSTOMER_NOT_FOUND` | `CART_003` | 400 |
| `CART_NOT_FOUND` | `CART_004` | 400 |
| `PRODUCT_NOT_FOUND_IN_CART` | `CART_005` | 400 |
| `PRODUCT_OUT_OF_STOCK` | `CART_006` | 400 |
| `CUSTOMER_NOT_FOUND` | `CART_007` | 400 |
| `PRODUCT_INACTIVE` | `CART_008` | 400 |
| `CUSTOMER_NOT_FOUND` | `CART_007` | 400 |

### `auth`

| Constant | Code | HTTP |
|---|---|---|
| `ANONYMOUS_CUSTOMER_NOT_FOUND` | `AUTH_001` | 403 |
| `INVALID_VERIFICATION_CODE` | `AUTH_002` | 400 |
| `INACTIVE_CUSTOMER` | `AUTH_003` | 403 |
| `INVALID_REFRESH_TOKEN` | `AUTH_004` | 401 |
| `CUSTOMER_NOT_FOUND` | `AUTH_005` | — |
| `INVALID_TOKEN_IN_DECORATOR` | `AUTH_006` | 401 |

### `me`

| Constant | Code | HTTP |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | `ME_001` | — |
| `NO_FIELDS_TO_UPDATE` | `ME_002` | 400 |
| `ADDRESS_ALREADY_EXISTS` | `ME_003` | 409 |
| `ADDRESS_NOT_FOUND` | `ME_004` | 404 |
| `ALREADY_INITIALIZED` | `ME_005` | 400 |
| `CANNOT_REMOVE_MAIN_ADDRESS` | `ME_006` | 400 |
| `LIMITED_NUMBER_OF_ADDRESSES` | `ME_007` | 409 |

### `order`

| Constant | Code | HTTP |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | `ORDER_001` | 404 |
| `CUSTOMER_NOT_INITIALIZED` | `ORDER_002` | 400 |
| `CART_EMPTY` | `ORDER_003` | 400 |
| `ONGOING_ORDER` | `ORDER_004` | 400 |
| `PRODUCTS_OUT_OF_STOCK` | `ORDER_005` | 400 |
| `PRODUCT_INACTIVE` | `ORDER_006` | 400 |
| `ORDER_NOT_FOUND` | `ORDER_007` | 404 |
| `ORDER_NOT_CANCELLABLE` | `ORDER_008` | 400 |

---

## Conventions

| Rule | Detail |
|---|---|
| Never throw raw `Error` | Always use `AppException` for expected failure paths |
| Never throw `HttpException` directly | Use `AppException` so the code field is always present |
| Error messages in pt-BR | User-facing strings, consistent with codebase convention |
| HTTP status via `AppException.HttpStatus` | Re-exports `@nestjs/common`'s `HttpStatus` enum — no need to import separately |
| Add codes before throwing | Register the code in `AppException.errorCodes` before using it |
