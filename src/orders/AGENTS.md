# AGENTS.md — src/orders/

## What belongs here

The order lifecycle for authenticated customers: creating an order from the current cart, listing orders, and cancelling an order.

## What does NOT belong here

- Cart management → the cart module.
- Admin order listing → the admin orders sub-module.

---

## Auth Requirement

The entire controller is protected by the access-token guard. The authenticated customer id comes from the current session. All endpoints return the customer's full, freshly computed order list rather than just the affected order.

---

## Create Order Flow

**Pre-transaction validations** (fail fast, before any write): the store must be available for orders — if a store-closed setting is active (on-break or outside business hours), checkout is rejected with that setting's configured message; the customer must exist and be active; the customer must have a name set; the cart must be non-empty; every cart item must be active and have sufficient stock; the customer must have a main address; the order total (cart subtotal + delivery fee) must meet the configured minimum order value (skipped when the setting is absent or zero). The settings and delivery fee are fetched before entering the transaction.

**Inside the transaction** a row-level lock is taken on the customer row (`SELECT ... FOR UPDATE`) to serialize concurrent order creation for the same customer. After the lock: reject if a non-terminal order already exists; create the order with item snapshots (name, price, image captured at purchase time); decrement stock atomically with a guarded conditional update; and clear the cart.

**Address snapshot**: the delivery address is stored as a formatted immutable string at creation time, so later changes to the customer's addresses never affect past orders.

---

## Cancel Order Flow

Fetch the order scoped by customer id (ownership check), then in a transaction conditionally transition only cancellable statuses to cancelled (a zero-row result means the order has progressed past a cancellable state) and restore stock for each item.

---

## Emitted Events

Order creation and cancellation emit lifecycle events through the event emitter rather than calling other modules directly. Listeners elsewhere react to them — order movements are recorded in the inventory ledger and customer push notifications are sent. The cancellation event carries the movement origin so the ledger does not have to infer it. These side effects are fire-and-forget from this module's perspective; the response is the freshly computed order list regardless.

---

## Response DTO

Each order carries DB fields plus computed totals (subtotal from item price × quantity, total adding the delivery fee) and a nested item collection.

---

## Conventions

| Rule | Detail |
|---|---|
| Validate before writing | All cheap validations run before the transaction |
| Serialize concurrency | Per-customer order creation is serialized with a row-level lock |
| Snapshots | Item details and the address are snapshotted at purchase time and never back-filled |
| Atomic stock | Stock decrement/restore happens inside the order transaction with guarded updates |
| Decouple side effects | Ledger and notifications are driven by emitted lifecycle events, not direct calls |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
