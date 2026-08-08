# AGENTS.md — src/coupons/

## What belongs here

The service layer for coupon **redemption rules** shared across feature modules: whether a coupon is currently available (active, started, not expired), how much discount it yields for a given subtotal, and whether its usage limits (global or per-customer) have been reached. Most of this module is consumed in-process by other modules that import it: the cart module (at coupon assignment **and on every cart format**, since discount and welcome-coupon state are recomputed on each read) and the orders module (at order placement).

It also owns the single **client-facing** coupon route — the authenticated customer's coupon listing (see below).

## What does NOT belong here

- Coupon CRUD (create/update/activate/deactivate/delete) and admin-facing listing/filtering → `admin/coupons`.
- Recording that a coupon was used (usage-row creation) → the orders module does this at order placement, not here.
- Assigning a coupon to a cart or removing it → `cart`.

---

## Module Design

The module provides and exports its service so other modules can depend on it, **and** registers a controller for the client-facing listing. It is imported both by `AppModule` (for the route) and by the modules that consume the service (`cart`, `orders`).

---

## Client Listing

The module's only route. Authenticated only (`AccessTokenGuard` on the controller class); returns the coupons an authenticated customer can see, serialized through the response DTO. A coupon is listed when it is active and has started — including coupons the customer can no longer redeem, each carrying a flag saying **why**, so the client renders them disabled instead of them silently disappearing.

A coupon the customer already redeemed (they have a `CouponUsage` row for it) stays in the list flagged as used, with no time limit.

A coupon that became unusable for **everyone** stays in the list for a **sold-out visibility window** (`SOLD_OUT_VISIBILITY_DAYS`) counted from that moment, flagged as sold out, so the client can show scarcity. There are two sold-out causes and they share the **same flag**:

| Cause | Sold-out instant |
|---|---|
| Global `usageLimit` reached | The `createdAt` of the usage that reached the limit — the row at offset `usageLimit - 1` of the coupon's usages ordered oldest-first |
| `endsAt` passed | The `endsAt` itself |

When both apply, the **earliest** instant wins — the window counts from the moment the coupon first became unusable. Past the window the coupon drops out entirely. Expiry is filtered in the query (`endsAt` within the window or null); the usage-limit case is filtered in memory, since its instant is only known after resolving the limit-reaching usage.

| Field | Meaning |
|---|---|
| `isSoldOut` | `true` when the coupon is inside the visibility window for either cause. Always present |
| `isUsed` | `true` when the customer has a `CouponUsage` row for the coupon. Always present |
| `isInCart` | `true` when the coupon is the one currently applied to the customer's cart (`Cart.couponId`), read in the same round trip as the listing. Always present, and at most one coupon carries it — the cart holds a single coupon |
| `remainingUses` | How many uses are left — **only** when the coupon has a `usageLimit`, is not sold out (for any cause), and 10 or fewer remain. `null` otherwise (unlimited coupon, plenty left, or sold out) |

The 10-use threshold lives in `LOW_REMAINING_USES_THRESHOLD` at the top of the service. Coupons come back newest first (`createdAt desc`), then re-sorted so the ones the customer can still redeem lead the list and every unusable one (sold out **or** already used) is pushed to the end.

There is no persisted usage counter and no persisted sold-out timestamp: the count is derived from the `usages` relation (`_count`), the same source of truth `admin/coupons` uses, and the sold-out instant is resolved with a targeted lookup of the limit-reaching usage — **only** for the coupons whose count actually reached the limit, so the relation is never hydrated in full. The welcome coupon is **not** in this listing — it has no `Coupon` row (see below) and reaches the client through the cart's `isWelcomeCoupon` flag.

---

## Central Pattern

The two **real-coupon** rules (`isCouponUnavailable`, `calculateDiscount`) are pure functions of a `Coupon` row, with no I/O: a coupon is unavailable if inactive, not yet started, or past its end date; a discount is zero unless the coupon is available and the subtotal meets its minimum order value, otherwise `FIXED` discounts a cents amount and `PERCENTAGE` discounts a whole-number percent of the subtotal — both capped at the subtotal so a discount can never exceed it. Usage-limit checks (`hasReachedUsageLimit`, `hasCustomerUsedCoupon`) and the per-coupon eligibility check (`isCustomerEligibleForCoupon`, below) do read from the database and are the pieces callers must re-run at redemption time, since they depend on state that changes over time. The welcome-coupon methods (below) do not fit this shape — one of them queries the database.

Availability is evaluated against the exact current timestamp: `startsAt`/`endsAt` are compared directly to `new Date()`, with no truncation to day boundaries and no timezone adjustment.

---

## Per-Coupon Eligibility

A coupon can be **restricted to a specific set of customers** through the `CouponCustomer` join table. The model is the single source of truth for *who is allowed to redeem a given coupon* — distinct from `CouponUsage` (which records redemptions, not eligibility).

Semantics:

- A coupon **with no** `CouponCustomer` rows is **open to every authenticated customer** — existing behavior is preserved.
- A coupon **with at least one** `CouponCustomer` row is **restricted**: only the listed customers can see, assign, or redeem it. The check is the same one everywhere (`isCustomerEligibleForCoupon`); callers (cart assignment, order revalidation) re-run it on each call since eligibility changes over time.

`isCustomerEligibleForCoupon(couponId, customerId)` returns `true` when either there is an explicit `CouponCustomer` row for the pair, **or** the coupon has no `CouponCustomer` rows at all. It returns `false` only when the coupon is restricted and the customer is not on the list. The list-membership probe is one indexed lookup on the composite key, and the "is the list empty?" probe is a count against the indexed `couponId` — never a full hydration of the relation.

The client listing (`findAvailableCoupons`) filters on the same condition in the `where` clause (`eligibleCustomers.none` OR `eligibleCustomers.some(customerId)`), so restricted coupons simply do not appear to non-eligible customers. There is no per-coupon flag telling the client the coupon is restricted; the list filter is the gate.

---

## Conventions

| Rule | Detail |
|---|---|
| One client route only | The controller exposes the customer-facing listing; redemption itself happens through `cart`/`orders`, and CRUD through `admin/coupons` |
| Exported service | Consumed via NestJS module imports, not direct instantiation |
| Pure where possible | Real-coupon availability/discount calculations take a `Coupon` and return a value — no side effects |
| Per-coupon eligibility | A coupon with `CouponCustomer` rows is restricted to those customers; a coupon without rows is open. `isCustomerEligibleForCoupon` enforces it everywhere it matters |
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

`calculateWelcomeDiscount` does **not** call `isCustomerEligibleForWelcomeCoupon`, nor does it check whether the setting is configured at all. Both are the **caller's** responsibility: both callers (cart formatting and order placement) first check that `WELCOME_COUPON` is present in the settings map (`SettingsService.findAll()` drops inactive keys), then run the eligibility check, and only then compute the discount. Calling `calculateWelcomeDiscount` on its own would hand a welcome discount to a repeat customer or to an unconfigured setting (returning `0` rather than signaling "not configured") — if you add a third consumer, replicate both gates.

Callers pass in the already-fetched settings map (`SettingsService.findAll()`) rather than this service re-fetching it.

The coupon surfaces to consumers as the fixed code `WELCOME_COUPON_CODE` (`"BEMVINDO"`), so cart and order responses carry a `couponCode`/`couponDiscount` pair identical in shape to a real coupon redemption from the client's perspective. Note the two consumers expose it on slightly different terms — see the welcome-coupon sections of `src/cart/AGENTS.md` and `src/orders/AGENTS.md`.
