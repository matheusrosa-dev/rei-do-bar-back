# API Contract (internal reference)

Stable HTTP I/O conventions for this backend. This file holds the concrete values that must not be scattered across directory `AGENTS.md` files (which document patterns, not instances). Update this file when the contract changes.

---

## Success Response Envelope

Every successful response is wrapped as:

```json
{ "data": <handler body> }
```

Passthrough rules: a falsy body, or a body that already contains a `data` key, is returned unchanged (no double-wrapping). When a controller applies a response DTO, the serialized DTO is what ends up inside `data`.

## Error Response Shape

The global filter emits **three** shapes. Only the first comes from `AppException`; clients must handle all three.

**1. Handled application errors** (`AppException`) — the status is chosen at the throw site:

```json
{ "code": "DOMAIN_NNN", "message": "Mensagem em pt-BR" }
```

**2. Validation errors** — the global `ValidationPipe` is configured with `errorHttpStatusCode: 422`, so a DTO validation failure returns **422** with no domain code. Note `message` is an **array** here, and its contents are class-validator output, not curated pt-BR copy:

```json
{ "code": "UNKNOWN", "message": ["phone must be a string"] }
```

`UNKNOWN` is the filter's fallback for any `HttpException` carrying no `code` — framework-generated 401/403/404 responses land here too.

**3. Unexpected (non-HTTP) errors** — HTTP 500:

```json
{ "code": "INTERNAL_ERROR", "message": "Erro interno do servidor" }
```

The `code` is always stable and machine-readable. The `message` is user-facing pt-BR **for shape 1 and 3 only** — do not render shape 2's array to end users as-is.

---

## Error-Code Registry

Codes are namespaced by domain on the application exception's static registry. Add a code here **and** in the registry before throwing it. The HTTP status is chosen at the throw site (not stored in the registry).

| Namespace | Constant | Code |
|---|---|---|
| cart | `PRODUCT_NOT_FOUND` | `CART_001` |
| cart | `PRODUCT_ALREADY_IN_CART` | `CART_002` |
| cart | `ANONYMOUS_CUSTOMER_NOT_FOUND` | `CART_003` |
| cart | `CART_NOT_FOUND` | `CART_004` |
| cart | `PRODUCT_NOT_FOUND_IN_CART` | `CART_005` |
| cart | `PRODUCT_OUT_OF_STOCK` | `CART_006` |
| cart | `CUSTOMER_NOT_FOUND` | `CART_007` |
| cart | `PRODUCT_INACTIVE` | `CART_008` |
| cart | `INVALID_SESSION` | `CART_009` |
| cart | `COUPON_NOT_FOUND` | `CART_010` |
| cart | `COUPON_UNAVAILABLE` | `CART_011` |
| cart | `COUPON_MIN_ORDER_NOT_MET` | `CART_012` |
| cart | `COUPON_USAGE_LIMIT_REACHED` | `CART_013` |
| cart | `COUPON_ALREADY_USED` | `CART_014` |
| cart | `COUPON_REQUIRES_AUTH` | `CART_015` |
| cart | `COUPON_NOT_ASSIGNED` | `CART_016` |
| auth | `ANONYMOUS_CUSTOMER_NOT_FOUND` | `AUTH_001` |
| auth | `INVALID_VERIFICATION_CODE` | `AUTH_002` |
| auth | `INVALID_REFRESH_TOKEN` | `AUTH_004` |
| auth | `CUSTOMER_NOT_FOUND` | `AUTH_005` |
| auth | `INVALID_TOKEN_IN_DECORATOR` | `AUTH_006` |
| auth | `RATE_LIMIT_EXCEEDED` | `AUTH_007` |
| me | `CUSTOMER_NOT_FOUND` | `ME_001` |
| me | `NO_FIELDS_TO_UPDATE` | `ME_002` |
| me | `ADDRESS_ALREADY_EXISTS` | `ME_003` |
| me | `ADDRESS_NOT_FOUND` | `ME_004` |
| me | `ALREADY_INITIALIZED` | `ME_005` |
| me | `CANNOT_REMOVE_MAIN_ADDRESS` | `ME_006` |
| me | `LIMITED_NUMBER_OF_ADDRESSES` | `ME_007` |
| me | `ADDRESS_ALREADY_MAIN` | `ME_008` |
| me | `CANNOT_DELETE_WITH_ACTIVE_ORDER` | `ME_009` |
| order | `CUSTOMER_NOT_INITIALIZED` | `ORDER_002` |
| order | `CART_EMPTY` | `ORDER_003` |
| order | `ONGOING_ORDER` | `ORDER_004` |
| order | `PRODUCTS_OUT_OF_STOCK` | `ORDER_005` |
| order | `PRODUCT_INACTIVE` | `ORDER_006` |
| order | `ORDER_NOT_FOUND` | `ORDER_007` |
| order | `ORDER_NOT_CANCELLABLE` | `ORDER_008` |
| order | `NO_MAIN_ADDRESS` | `ORDER_009` |
| order | `INACTIVE_CUSTOMER` | `ORDER_010` |
| order | `BELOW_MIN_ORDER_VALUE` | `ORDER_011` |
| order | `OUTSIDE_BUSINESS_HOURS` | `ORDER_012` |
| order | `ON_BREAK` | `ORDER_013` |
| order | `COUPON_UNAVAILABLE` | `ORDER_014` |
| order | `COUPON_MIN_ORDER_NOT_MET` | `ORDER_015` |
| order | `COUPON_USAGE_LIMIT_REACHED` | `ORDER_016` |
| order | `COUPON_ALREADY_USED` | `ORDER_017` |
| order | `WELCOME_COUPON_UNAVAILABLE` | `ORDER_018` |
| products | `INVALID_SESSION` | `PRODUCTS_001` |
| adminProducts | `PRODUCT_NOT_FOUND` | `ADMIN_PRODUCTS_002` |
| adminProducts | `INVALID_CATEGORY` | `ADMIN_PRODUCTS_003` |
| adminProducts | `CATEGORY_INACTIVE` | `ADMIN_PRODUCTS_004` |
| adminProducts | `INVALID_PRODUCTS_ORDER` | `ADMIN_PRODUCTS_005` |
| adminCategories | `CATEGORY_NOT_FOUND` | `ADMIN_CATEGORIES_001` |
| adminCategories | `CATEGORY_HAS_PRODUCTS` | `ADMIN_CATEGORIES_002` |
| adminCategories | `CATEGORY_ALREADY_EXISTS` | `ADMIN_CATEGORIES_003` |
| adminCategories | `INVALID_CATEGORIES_ORDER` | `ADMIN_CATEGORIES_004` |
| adminCustomers | `CUSTOMER_NOT_FOUND` | `ADMIN_CUSTOMERS_001` |
| adminCustomers | `CUSTOMER_HAS_ORDERS` | `ADMIN_CUSTOMERS_002` |
| adminOrders | `ORDER_NOT_FOUND` | `ADMIN_ORDERS_001` |
| adminOrders | `ORDER_ALREADY_FINALIZED` | `ADMIN_ORDERS_002` |
| adminOrders | `ORDER_INVALID_STATUS_TRANSITION` | `ADMIN_ORDERS_003` |
| adminInventory | `INSUFFICIENT_STOCK` | `ADMIN_INVENTORY_001` |
| adminInventory | `PRODUCT_NOT_FOUND` | `ADMIN_INVENTORY_002` |
| adminInventory | `DUPLICATE_PRODUCT` | `ADMIN_INVENTORY_003` |
| adminCoupons | `COUPON_NOT_FOUND` | `ADMIN_COUPONS_001` |
| adminCoupons | `COUPON_ALREADY_EXISTS` | `ADMIN_COUPONS_002` |
| adminCoupons | `COUPON_START_NOT_EDITABLE` | `ADMIN_COUPONS_004` |
| adminCoupons | `INVALID_USAGE_LIMIT` | `ADMIN_COUPONS_005` |
| adminCoupons | `INVALID_DISCOUNT_VALUE` | `ADMIN_COUPONS_006` |
| adminSettings | `INVALID_SETTING_VALUE` | `ADMIN_SETTINGS_001` |

---

## Pagination Contract

Admin list endpoints accept the following query params:

| Param | Type | Default / Range |
|---|---|---|
| `page` | int | defaults to 1, min 1 |
| `limit` | int | defaults to 20, range 1–100 |
| `searchTerm` | string | optional, case-insensitive OR search |
| `sortKey` | string | optional; the allowed keys are declared per resource on its DTO |
| `sortDirection` | `asc` \| `desc` | optional; defaults to `desc` when a sort key is present |

Resources add their own filters on top of these (e.g. `categoryId` / `isActive` on products, `status` / `paymentType` on orders). With no `sortKey`, listings fall back to newest-first (`createdAt desc`).

The response is a normalized page:

```json
{
  "items": [ /* ... */ ],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

**Exception**: the admin categories listing is not paginated — it returns a flat array with no `meta`.

---

## Monetary Values

All prices and fees are integers in **cents** end-to-end (e.g. `1500` = R$15,00). **Responses carry cents too** — the API does not convert to currency, and formatting is the client's responsibility.

---

## Session Context

The session is **additive, not exclusive**. The current-session decorator always populates `deviceId` from the `x-device-id` header, and *adds* `customerId` / `phone` on top when a valid access token is present — so an authenticated session carries **both**. Cart-, product-, and order-related reads branch on *whether a `customerId` is present*, not on an either/or.

The raw `token` is attached only on the two routes that consume a refresh token: `/auth/refresh` and `/auth/logout`.
