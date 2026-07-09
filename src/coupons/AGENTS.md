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

Availability is evaluated at **day granularity** against the start of the current day in the store's timezone — a coupon whose window starts today is already available, and one whose window ends today remains available for the rest of the day.

---

## Conventions

| Rule | Detail |
|---|---|
| No controller | This is a service-only module; never add routes here |
| Exported service | Consumed via NestJS module imports, not direct instantiation |
| Pure where possible | Availability/discount calculations take a `Coupon` and return a value — no side effects |
| Monetary values | Stored/handled in cents; discount is capped at the subtotal for both discount types |
