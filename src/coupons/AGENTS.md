# AGENTS.md — src/coupons/

## What belongs here

The internal service layer for coupon **redemption rules** shared across feature modules: whether a coupon is currently available (active, started, not expired), how much discount it yields for a given subtotal, and whether its usage limits (global or per-customer) have been reached. This module has **no public HTTP controller** — it exists to expose its service to other modules that import it (currently the cart module at coupon assignment and the orders module at order placement).

## What does NOT belong here

- Coupon CRUD (create/update/activate/deactivate/delete) and admin-facing listing/filtering → `admin/coupons`.
- Recording that a coupon was used (usage-row creation) → the orders module does this at order placement, not here.
- Any route handler.

---

## Module Design

The module provides and exports its service so other modules can depend on it. It registers no controller and owns no routes.

---

## Central Pattern

Availability and discount rules are pure functions of a `Coupon` row (no I/O): a coupon is unavailable if inactive, not yet started, or past its end date; a discount is zero unless the coupon is available and the subtotal meets its minimum order value, otherwise `FIXED` discounts a cents amount and `PERCENTAGE` discounts a whole-number percent of the subtotal — both capped at the subtotal so a discount can never exceed it. Usage-limit checks (`hasReachedUsageLimit`, `hasCustomerUsedCoupon`) do read from `CouponUsage` and are the pieces callers must re-run at redemption time, since they depend on state that changes over time.

Availability is evaluated against the exact current timestamp: `startsAt`/`endsAt` are compared directly to `new Date()`, with no truncation to day boundaries and no timezone adjustment.

---

## Conventions

| Rule | Detail |
|---|---|
| No controller | This is a service-only module; never add routes here |
| Exported service | Consumed via NestJS module imports, not direct instantiation |
| Pure where possible | Availability/discount calculations take a `Coupon` and return a value — no side effects |
| Monetary values | Stored/handled in cents; discount is capped at the subtotal for both discount types |

---

## Welcome Coupon

The welcome coupon is **not a `Coupon` row** — it lives entirely in the `settings` table under `SettingKey.WELCOME_COUPON` (`SettingType.COUPON`), its value a JSON string `{ discountValue, minOrderValue }` (both in cents). Because it has no id, it can never be referenced by `Cart.couponId`, `Order.couponId`, or `CouponUsage` — there is no assignment step, no usage-limit tracking, and no way for a customer to "already have used" it in the `CouponUsage` sense.

Eligibility is derived instead of stored: a customer is eligible while they have zero non-cancelled orders (`OrderStatus.CANCELLED` orders don't count, so cancelling a first order restores eligibility). `getWelcomeCoupon` parses and validates the setting's JSON (returning `null` on anything malformed or absent, per the "missing/invalid = not configured" convention), `isEligibleForWelcomeCoupon` checks the order count, and `calculateWelcomeDiscount` combines both — cheap checks (setting present, subtotal meets minimum) run before the eligibility query. Callers pass in the already-fetched settings map (`SettingsService.findAll()`) rather than this service re-fetching it.

It surfaces to consumers as the fixed code `WELCOME_COUPON_CODE`, so cart and order responses carry a `couponCode`/`discount` pair identical in shape to a real coupon redemption from the client's perspective.
