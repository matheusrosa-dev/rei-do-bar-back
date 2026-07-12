# AGENTS.md — src/coupons/

## What belongs here

The internal service layer for coupon **redemption rules** shared across feature modules: whether a coupon is currently available (active, started, not expired), how much discount it yields for a given subtotal, and whether its usage limits (global or per-customer) have been reached. This module has **no public HTTP controller** — it exists to expose its service to other modules that import it: the cart module (at coupon assignment **and on every cart format**, since discount and welcome-coupon state are recomputed on each read) and the orders module (at order placement).

## What does NOT belong here

- Coupon CRUD (create/update/activate/deactivate/delete) and admin-facing listing/filtering → `admin/coupons`.
- Recording that a coupon was used (usage-row creation) → the orders module does this at order placement, not here.
- Any route handler.

---

## Module Design

The module provides and exports its service so other modules can depend on it. It registers no controller and owns no routes.

---

## Central Pattern

The two **real-coupon** rules (`isCouponUnavailable`, `calculateDiscount`) are pure functions of a `Coupon` row, with no I/O: a coupon is unavailable if inactive, not yet started, or past its end date; a discount is zero unless the coupon is available and the subtotal meets its minimum order value, otherwise `FIXED` discounts a cents amount and `PERCENTAGE` discounts a whole-number percent of the subtotal — both capped at the subtotal so a discount can never exceed it. Usage-limit checks (`hasReachedUsageLimit`, `hasCustomerUsedCoupon`) do read from `CouponUsage` and are the pieces callers must re-run at redemption time, since they depend on state that changes over time. The welcome-coupon methods (below) do not fit this shape — one of them queries the database.

Availability is evaluated against the exact current timestamp: `startsAt`/`endsAt` are compared directly to `new Date()`, with no truncation to day boundaries and no timezone adjustment.

---

## Conventions

| Rule | Detail |
|---|---|
| No controller | This is a service-only module; never add routes here |
| Exported service | Consumed via NestJS module imports, not direct instantiation |
| Pure where possible | Real-coupon availability/discount calculations take a `Coupon` and return a value — no side effects |
| Welcome discount is not self-gating | Callers must check eligibility before applying it; the calculation trusts them |
| Monetary values | Stored/handled in cents; discount is capped at the subtotal for both discount types |

---

## Welcome Coupon

The welcome coupon is **not a `Coupon` row** — it lives entirely in the `settings` table under `SettingKey.WELCOME_COUPON` (`SettingType.CURRENCY`), its value a plain discount amount in cents (e.g. `"500"`). Because it has no id, it can never be referenced by `Cart.couponId`, `Order.couponId`, or `CouponUsage` — there is no assignment step, no usage-limit tracking, and no way for a customer to "already have used" it in the `CouponUsage` sense.

Eligibility is derived instead of stored: a customer is eligible while they have zero non-cancelled orders (`OrderStatus.CANCELLED` orders don't count, so cancelling a first order restores eligibility).

Two methods split the work, and **the split is load-bearing**:

| Method | Does | Does NOT |
|---|---|---|
| `isCustomerEligibleForWelcomeCoupon(customerId)` | Queries the customer's non-cancelled order count | Look at the setting or the subtotal |
| `calculateWelcomeDiscount(subtotal, settings)` | Reads the discount amount from the setting and caps it at the subtotal | **Check eligibility at all** |

There is no minimum-order gate on the welcome coupon — the only cap is the subtotal itself (so an empty cart yields `0`). The setting value is trusted as-is: a non-numeric value produces `NaN`, just like any other `CURRENCY` setting (e.g. `DELIVERY_FEE`); keeping it valid is the admin write path's responsibility.

`calculateWelcomeDiscount` does **not** call `isCustomerEligibleForWelcomeCoupon`. Gating on eligibility is the **caller's** responsibility, and both callers (cart formatting and order placement) run the eligibility check **first** and only then compute the discount. Calling `calculateWelcomeDiscount` on its own would hand a welcome discount to a repeat customer — if you add a third consumer, replicate the gate.

Callers pass in the already-fetched settings map (`SettingsService.findAll()`) rather than this service re-fetching it.

The coupon surfaces to consumers as the fixed code `WELCOME_COUPON_CODE` (`"BEMVINDO"`), so cart and order responses carry a `couponCode`/`discount` pair identical in shape to a real coupon redemption from the client's perspective. Note the two consumers expose it on slightly different terms — see the welcome-coupon sections of `src/cart/AGENTS.md` and `src/orders/AGENTS.md`.
