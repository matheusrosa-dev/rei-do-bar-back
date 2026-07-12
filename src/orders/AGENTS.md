# AGENTS.md — src/orders/

## What belongs here

The order lifecycle for authenticated customers: creating an order from the current cart, listing orders, and cancelling an order.

## What does NOT belong here

- Cart management → the cart module.
- Admin order listing → the admin orders sub-module.
- Coupon redemption rules (availability, discount calculation, usage reads) → the coupons module; this module imports it and only orchestrates revalidation, usage recording, and reversal.

---

## Auth Requirement

The entire controller is protected by the access-token guard. The authenticated customer id comes from the current session. All endpoints return the customer's full, freshly computed order list rather than just the affected order.

---

## Create Order Flow

**Pre-transaction validations** (fail fast, before any write): the settings map is fetched **first**, and if a store-closed setting is active (on-break or outside business hours) checkout is rejected with that setting's configured message; the customer must exist and be active (both the missing and the inactive case raise the same inactive-customer error); the customer must have a name set; the cart must be non-empty; every cart item must be active, **not soft-deleted**, and have sufficient stock; if the cart carries a coupon it is revalidated before any write — availability (delegated to the coupons service), the cart subtotal against the coupon's own minimum order value, the global usage limit, and whether the customer has already used it — and the discount is computed from the subtotal; the order total minus the coupon discount (cart subtotal plus delivery fee, discount subtracted) must meet the configured minimum order value (skipped when the setting is absent or zero); the customer must have a main address. The settings and delivery fee are fetched before entering the transaction.

**Inside the transaction** a row-level lock is taken on the customer row (`SELECT ... FOR UPDATE`) to serialize concurrent order creation for the same customer. After the lock: reject if a non-terminal order already exists; create the order with item snapshots (name, price, image captured at purchase time); decrement stock atomically with a guarded conditional update; when a coupon is applied, record its usage — for coupons with a global usage limit a row-level lock is first taken on the coupon row and usages are re-counted under the lock so concurrent customers cannot exceed it, and the unique (coupon, customer) constraint converts a duplicate-usage race into the domain already-used error; and clear the cart, also detaching the consumed coupon from it.

**Address snapshot**: the delivery address is stored as a formatted immutable string at creation time, so later changes to the customer's addresses never affect past orders.

**Coupon snapshot**: the applied coupon's code and the computed discount are stored on the order at creation time, so later coupon changes or deletion never affect past orders. The order also keeps a nullable reference to the coupon row (nulled if the coupon is deleted), used to revert the usage exactly on cancellation.

**Welcome coupon**: when the cart carries no real coupon, the customer's welcome-coupon discount (see `src/coupons/AGENTS.md`) is computed — eligibility query first, then the discount — and folded into `discount` before the minimum-order check. Unlike the cart, order placement always runs against an authenticated `customerId`, so it always resolves eligibility through the query (there is no anonymous shortcut here). Because it isn't backed by a `Coupon` row, the order snapshots `couponId: null` and `couponCode: WELCOME_COUPON_CODE` whenever the customer is **eligible** (`isWelcomeCoupon`), the same condition the cart uses — not gated on the computed discount being non-zero. An eligible customer with an empty-enough cart still gets the coupon code snapshotted on the order with `discount: 0`, mirroring what they saw in the cart. No `CouponUsage` row is created and cancellation has nothing to revert — eligibility is re-derived from order history, so cancelling the order already restores it.

Eligibility is checked once before the transaction and **re-checked under the customer row lock**, right where the ongoing-order check happens, to close the race with a concurrent order creation. Note what failing that re-check does: the order is **rejected** with the welcome-coupon-unavailable error, not silently repriced without the discount. The customer never gets charged a total they did not see.

---

## Cancel Order Flow

Fetch the order scoped by customer id (ownership check), then in a transaction conditionally transition it to cancelled. The condition is **`status = PENDING`** — that is the only status a customer may cancel; once the kitchen has accepted the order, cancellation is the admin's call. A zero-row result means the order has already moved on, and the request is rejected rather than silently doing nothing.

The same transaction restores stock for each item (a plain increment — unlike the decrement at creation, there is nothing to guard against) and reverts any coupon usage: the customer's usage row is deleted through the coupon reference snapshotted on the order, making the coupon redeemable again (skipped if the coupon was deleted, since its usages cascade away with it).

---

## Emitted Events

Order creation and cancellation emit lifecycle events through the event emitter rather than calling other modules directly. Listeners elsewhere react to them — order movements are recorded in the inventory ledger and customer push notifications are sent. The cancellation event carries the movement origin so the ledger does not have to infer it. These side effects are fire-and-forget from this module's perspective; the response is the freshly computed order list regardless.

---

## Response DTO

Each order carries DB fields plus computed totals (subtotal from item price × quantity; total as `subtotal + deliveryFee - discount`), the applied coupon code and discount, and a nested item collection.

Unlike the cart response, the order response carries **no `isWelcomeCoupon` flag** and does not expose `couponId` — a client distinguishes a welcome discount from a real coupon solely by the `couponCode` matching the welcome code.

---

## Conventions

| Rule | Detail |
|---|---|
| Validate before writing | All cheap validations run before the transaction |
| Serialize concurrency | Per-customer order creation is serialized with a row-level lock on the customer; globally-limited coupon redemption with a row-level lock on the coupon |
| Snapshots | Item details, the address, and the applied coupon (code + discount) are snapshotted at purchase time and never back-filled |
| Customers cancel only while pending | Any later status is the admin's to transition |
| Atomic stock | Stock decrement and restore both happen inside the order transaction; the **decrement** is a guarded conditional update (restoring stock cannot fail the same way) |
| Decouple side effects | Ledger and notifications are driven by emitted lifecycle events, not direct calls |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
