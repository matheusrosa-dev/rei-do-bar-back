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

Every cart operation resolves the owner from the current session, which carries **either** an anonymous device id **or** an authenticated customer id — never both. A single private resolver encapsulates this branching (anonymous lookup by device id vs. active-customer lookup by id) and always loads the cart with its items and their products. It throws a domain error when the owner or cart is missing.

---

## Central Pattern: Cart Operations

Every mutating operation follows the same shape:

1. Resolve the owner and load the cart with items.
2. Validate business rules (product exists/active, already-in-cart, stock availability).
3. Apply a single nested Prisma write on the cart, selecting back the items with their products.
4. Return the formatted cart.

**Formatting** reads the delivery fee from settings, surfaces a settings-driven store-status alert (e.g. an on-break message, or null when absent), converts cents to currency at presentation time, returns item-level totals (unit price × quantity) rather than unit prices, and exposes remaining stock per item.

**Decrement edge case**: decrementing an item whose quantity is 1 removes it from the cart rather than setting quantity to zero.

---

## Coupons

A coupon is **persisted on the cart** via the `couponId` relation, so every cart response (fetch and all mutations) reflects the applied coupon and its discount. Assigning a coupon requires an **authenticated customer** — anonymous sessions are rejected. The coupon code arrives as a route param.

The redemption rules themselves (availability, discount math, usage-limit checks) are **not owned here** — they're delegated to the shared `CouponsService` (`src/coupons/`), imported via `CouponsModule`. This module only orchestrates: it resolves the cart, looks up the coupon by code, calls into `CouponsService` for each rule, and persists/formats the result.

Assignment validates, in order: the coupon exists; it is available (`CouponsService.isCouponUnavailable`); the cart subtotal meets the coupon's `minOrderValue`; the global `usageLimit` is not reached (`CouponsService.hasReachedUsageLimit`); and the customer has not already used it (`CouponsService.hasCustomerUsedCoupon`). Each failure maps to a `cart.COUPON_*` code.

The discount is computed at **format time** via `CouponsService.calculateDiscount`, which only returns a non-zero value while the coupon is still available **and** the subtotal still meets `minOrderValue` (so an expiring/deactivated coupon or removing items after applying safely drops the discount without detaching the coupon). Both `FIXED` and `PERCENTAGE` discounts are capped at the subtotal. The discount reduces the subtotal only — never the delivery fee.

> The global `usageLimit` and per-customer usage are checked only at **assignment**; recording coupon *usage* (`CouponUsage`) happens at order placement, not here.

Removing a coupon simply clears `couponId` (throwing `COUPON_NOT_ASSIGNED` if the cart has none); it does not require authentication, since an anonymous cart can never have a coupon assigned in the first place.

### Welcome Coupon

Unlike a real coupon, the welcome coupon is applied **automatically** at format time — there is no assignment endpoint, no code to submit, and no `couponId` involved (it isn't a `Coupon` row; see `src/coupons/AGENTS.md`). `formatCart` computes it via `CouponsService.calculateWelcomeDiscount` only when the cart has **no coupon assigned** (a real coupon always takes priority) and the session carries an authenticated `customerId` (anonymous sessions never qualify). When it applies, `discount` is set and `couponCode` reports the fixed `WELCOME_COUPON_CODE` value, same as a real coupon redemption; the response additionally exposes an `isWelcomeCoupon` boolean so the client can distinguish the two.

---

## DTOs

Action DTOs all share the same single-field shape and are read from the **route param**, not the request body. The response DTO is applied at the controller class level and exposes the cart summary (including the applied coupon's code and the resulting discount, both as flat fields) plus an array of item objects.

---

## Conventions

| Rule | Detail |
|---|---|
| Owner resolution | Always via the shared private resolver; never branch on session inline in each method |
| Input source | Action DTOs validate the route param |
| Monetary values | Stored/handled in cents; divided only when formatting the response |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
