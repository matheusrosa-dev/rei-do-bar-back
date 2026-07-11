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

**Pre-transaction validations** (fail fast, before any write): the store must be available for orders — if a store-closed setting is active (on-break or outside business hours), checkout is rejected with that setting's configured message; the customer must exist and be active; the customer must have a name set; the cart must be non-empty; every cart item must be active and have sufficient stock; if the cart carries a coupon it is revalidated before any write — availability (delegated to the coupons service), the cart subtotal against the coupon's own minimum order value, the global usage limit, and whether the customer has already used it — and the discount is computed from the subtotal; the order total minus the coupon discount (cart subtotal plus delivery fee, discount subtracted) must meet the configured minimum order value (skipped when the setting is absent or zero); the customer must have a main address. The settings and delivery fee are fetched before entering the transaction.

**Inside the transaction** a row-level lock is taken on the customer row (`SELECT ... FOR UPDATE`) to serialize concurrent order creation for the same customer. After the lock: reject if a non-terminal order already exists; create the order with item snapshots (name, price, image captured at purchase time); decrement stock atomically with a guarded conditional update; when a coupon is applied, record its usage — for coupons with a global usage limit a row-level lock is first taken on the coupon row and usages are re-counted under the lock so concurrent customers cannot exceed it, and the unique (coupon, customer) constraint converts a duplicate-usage race into the domain already-used error; and clear the cart, also detaching the consumed coupon from it.

**Address snapshot**: the delivery address is stored as a formatted immutable string at creation time, so later changes to the customer's addresses never affect past orders.

**Coupon snapshot**: the applied coupon's code and the computed discount are stored on the order at creation time, so later coupon changes or deletion never affect past orders. The order also keeps a nullable reference to the coupon row (nulled if the coupon is deleted), used to revert the usage exactly on cancellation.

**Welcome coupon**: when the cart carries no real coupon, the customer's welcome-coupon discount (see `src/coupons/AGENTS.md`) is computed the same way as in the cart and folded into `discount` before the minimum-order check. Because it isn't backed by a `Coupon` row, the order snapshots `couponId: null` and `couponCode: WELCOME_COUPON_CODE` — no `CouponUsage` row is created and cancellation has nothing to revert (eligibility is re-derived from the order history itself, so cancelling the order already restores it). Eligibility is checked once before the transaction and re-checked under the customer row lock, right where the ongoing-order check happens, to close the race with a concurrent order creation.

---

## Cancel Order Flow

Fetch the order scoped by customer id (ownership check), then in a transaction conditionally transition only cancellable statuses to cancelled (a zero-row result means the order has progressed past a cancellable state) and restore stock for each item. Inside the same transaction any coupon usage is reverted — the customer's usage row is deleted through the coupon reference snapshotted on the order, making the coupon redeemable again (skipped if the coupon was deleted, since its usages cascade away with it).

---

## Emitted Events

Order creation and cancellation emit lifecycle events through the event emitter rather than calling other modules directly. Listeners elsewhere react to them — order movements are recorded in the inventory ledger and customer push notifications are sent. The cancellation event carries the movement origin so the ledger does not have to infer it. These side effects are fire-and-forget from this module's perspective; the response is the freshly computed order list regardless.

---

## Response DTO

Each order carries DB fields plus computed totals (subtotal from item price × quantity; total as subtotal plus delivery fee minus the snapshotted discount), the applied coupon code and discount, and a nested item collection.

---

## Conventions

| Rule | Detail |
|---|---|
| Validate before writing | All cheap validations run before the transaction |
| Serialize concurrency | Per-customer order creation is serialized with a row-level lock on the customer; globally-limited coupon redemption with a row-level lock on the coupon |
| Snapshots | Item details, the address, and the applied coupon (code + discount) are snapshotted at purchase time and never back-filled |
| Atomic stock | Stock decrement/restore happens inside the order transaction with guarded updates |
| Decouple side effects | Ledger and notifications are driven by emitted lifecycle events, not direct calls |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
