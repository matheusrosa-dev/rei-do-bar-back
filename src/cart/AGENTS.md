# AGENTS.md — src/cart/

## What belongs here

All cart operations for both anonymous and authenticated customers:
- Fetching cart contents.
- Adding, removing, incrementing, and decrementing products.
- Assigning or removing a coupon from the cart (assigning is authenticated-customers only; removing has no route param, since a cart holds at most one coupon).
- Cart formatting (subtotal, delivery fee, discount, total, product count).

## What does NOT belong here

- Cart creation — carts are created automatically alongside the anonymous customer (at device-id sync) or the customer (via the cart migration on first login).
- Authoritative product stock — that lives in the products domain.
- Delivery-fee configuration — the fee value is read from settings.

---

## The Anonymous/Customer Duality

Every cart operation resolves the owner from the current session. The session always carries a device id, and *additionally* a customer id once authenticated — so the resolver branches on **whether a `customerId` is present**, not on an either/or. A single private resolver encapsulates that branching (anonymous lookup by device id vs. customer lookup by id) and always loads the cart with its items and their products. It throws a domain error when the owner or cart is missing.

The customer lookup deliberately does **not** filter on `isActive` or the soft-delete timestamp — an inactive customer can still load and edit a cart. That gate lives at order placement, not here, so a deactivated customer is blocked at checkout rather than silently losing their cart.

---

## Central Pattern: Cart Operations

Every mutating operation follows the same shape:

1. Resolve the owner and load the cart with items.
2. Validate business rules (product exists/active, already-in-cart, stock availability).
3. Apply a single nested Prisma write on the cart, selecting back the items with their products.
4. Return the formatted cart.

**Adding a product** guards the already-in-cart case in two ways: an upfront check, plus a `catch` that translates the unique-constraint violation on `(cartId, productId)` into the same domain error — so two concurrent adds of the same product cannot both slip through. Use the `isUniqueConstraintViolation` predicate from `@shared/helpers/prisma-errors`, never a raw error-code match.

**Stock check on increment** only runs in the low-stock band (`stockQuantity <= 10`, the same threshold that drives `remainingStock`). Above it, the increment is not stock-checked — the assumption is that a product with plenty of stock cannot be exhausted by a single cart increment.

**Decrement edge case**: decrementing an item whose quantity is 1 removes it from the cart rather than setting quantity to zero.

### What `formatCart` returns

The response is not a straight projection of the cart row — it is assembled from the cart, the settings map, and the coupon rules:

| Field | Meaning |
|---|---|
| `products[]` | Per item: the product's **unit price** plus its `quantity` (and `compareAtPrice`, `remainingStock`). Item totals are the client's job — this module never multiplies |
| `subtotal` / `discount` / `deliveryFee` / `total` | Cart-level money, **all in cents** |
| `minOrderValue` / `remainingToMinOrderValue` | The settings-driven minimum and how much is still missing, measured against the **total** (i.e. after delivery fee and discount) |
| `onBreak` / `outsideBusinessHours` | Two **separate** settings-driven store-status messages, each null when its setting is off |
| `couponCode` / `isWelcomeCoupon` | The applied coupon (see below) |

**Empty cart**: `deliveryFee` and `total` are forced to `0` — an empty cart never shows a delivery charge.

**Monetary values are returned in cents, unconverted.** This module never divides by 100; formatting to currency is entirely the client's responsibility.

---

## Coupons

A coupon is **persisted on the cart** via the `couponId` relation, so every cart response (fetch and all mutations) reflects the applied coupon and its discount. Assigning a coupon requires an **authenticated customer** — anonymous sessions are rejected. The coupon code arrives as a route param.

The redemption rules themselves (availability, discount math, usage-limit checks) are **not owned here** — they're delegated to the shared `CouponsService` (`src/coupons/`), imported via `CouponsModule`. This module only orchestrates: it resolves the cart, looks up the coupon by code, calls into `CouponsService` for each rule, and persists/formats the result.

Assignment validates, in order: the coupon exists; it is available (`CouponsService.isCouponUnavailable`); the cart subtotal meets the coupon's `minOrderValue`; the global `usageLimit` is not reached (`CouponsService.hasReachedUsageLimit`); and the customer has not already used it (`CouponsService.hasCustomerUsedCoupon`). Each failure maps to a `cart.COUPON_*` code.

The discount is computed at **format time** via `CouponsService.calculateDiscount`, which only returns a non-zero value while the coupon is still available **and** the subtotal still meets `minOrderValue` (so an expiring/deactivated coupon or removing items after applying safely drops the discount without detaching the coupon). Both `FIXED` and `PERCENTAGE` discounts are capped at the subtotal. The discount reduces the subtotal only — never the delivery fee.

> The global `usageLimit` and per-customer usage are checked only at **assignment**; recording coupon *usage* (`CouponUsage`) happens at order placement, not here.

Removing a coupon simply clears `couponId` (throwing `COUPON_NOT_ASSIGNED` if the cart has none); it does not require authentication, since an anonymous cart can never have a coupon assigned in the first place.

### Welcome Coupon

Unlike a real coupon, the welcome coupon is applied **automatically** at format time — there is no assignment endpoint, no code to submit, and no `couponId` involved (it isn't a `Coupon` row; see `src/coupons/AGENTS.md`). It is considered only when the cart has **no coupon assigned** (a real coupon always takes priority) and the session carries an authenticated `customerId` (anonymous sessions never qualify).

Note carefully what the two exposed fields mean here: `isWelcomeCoupon` and `couponCode` are driven by **eligibility alone** (`CouponsService.isEligibleForWelcomeCoupon` — a first-time customer), *not* by a non-zero discount. The discount itself is computed separately and can legitimately be `0` — an empty cart, or a subtotal below the welcome coupon's `minOrderValue`. So an eligible customer with an empty cart is reported as `isWelcomeCoupon: true`, `couponCode: "BEMVINDO"`, `discount: 0`.

Orders mirror this: the welcome code is snapshotted on the order under the same eligibility condition, `discount` included even when it is `0`. Keep the two in sync — if the eligibility rule changes on one side, it must change on the other.

---

## DTOs

Action DTOs all share the same single-field shape and are read from the **route param**, not the request body. The response DTO is applied at the controller class level and exposes the cart summary (including the applied coupon's code and the resulting discount, both as flat fields) plus an array of item objects.

---

## Conventions

| Rule | Detail |
|---|---|
| Owner resolution | Always via the shared private resolver; never branch on session inline in each method |
| Input source | Action DTOs validate the route param |
| Monetary values | Handled **and returned** in cents — this module never converts to currency |
| Prisma errors via predicates | Translate the already-in-cart conflict with `isUniqueConstraintViolation`, never a raw code match |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
