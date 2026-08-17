# AGENTS.md — src/admin/orders/

## What belongs here

Admin order oversight: a status-grouped management board, a paginated/sortable listing, status-transition management (which is also where the delivery person is first assigned), and delivery-person reassignment.

## What does NOT belong here

- Customer order placement and cancellation → the top-level orders module.
- Stock restock/removal and the inventory ledger → the inventory sub-module.
- Delivery-person CRUD → the delivery-persons sub-module. Assignment only belongs here because the order is the resource being mutated.

---

## Core Patterns

- **Two listings, different shapes**:
  - The **management board** is not a page object and not the full order set. It returns an object **keyed by order status**, where the ongoing statuses (pending, preparing, shipped) carry *all* their orders (oldest first, so the kitchen works a queue), while the finalized ones (delivered, cancelled) are a **recent-activity window only** — the last 4 hours, capped at 30, newest first. It is a live operations board, not an archive.
  - The **paginated listing** is the archive: filterable (status, payment type, free-text on customer name or exact order number), sortable, and paginated.
  - Both carry the same per-order shape: the customer, the items with their products, the assigned delivery person (null until the order ships), and the computed totals.
- **Totals**: the money shape matches the customer-facing order response (see `src/orders/AGENTS.md`). `productsTotal` is the **gross** total (each item's snapshotted `compareAtPrice` when it was on sale, otherwise its `price`), `productsDiscount` is the sum of the on-sale differences, and `total` is `productsTotal - productsDiscount - couponDiscount + deliveryFee` — always built from the **net** total. `couponDiscount` is a snapshot on the order row (from a coupon or the welcome coupon).
- **Sorting**: `createdAt` is sorted at the DB level. `total` and item quantity are computed aggregates Prisma cannot order on, so they go through the in-memory two-step fetch (ids + computed value, then the page slice). The sort value for `total` and the returned total both go through `computeOrderTotals` from `@shared/helpers/products-totals` — the same helper the customer order response and the admin customer detail use. Keep them on it rather than re-deriving the formula here.
- **Status state machine**: transitions are constrained by an explicit per-status map of allowed next statuses — pending → preparing/cancelled; preparing → shipped/cancelled; shipped → delivered/cancelled; delivered and cancelled are terminal. An already-finalized order or an illegal transition raises the corresponding `adminOrders` error. The transition runs as a guarded conditional update inside a transaction, and a zero-row result (the status changed concurrently) raises the invalid-transition error rather than silently passing. A status reason is persisted only when the target status is *cancelled*.
- **Cancellation side effects**: cancelling restores each item's stock inside the transaction. Both events — order-cancelled (carrying the admin-cancellation origin, so the inventory listener records the movement without inferring it) and status-updated (consumed by the notifications listener) — are emitted **after the transaction commits**, so a listener never observes a state the database has not accepted yet. The status endpoint returns the **refreshed management board**, not the updated order.
- **Delivery-person assignment**: the initial assignment happens on the status transition to `SHIPPED`, which makes `deliveryPersonId` **required** in the status body (conditional `@ValidateIf` on the DTO, so it is only demanded for that target status). The delivery person must exist and be active; that check runs **inside** the same transaction as the status update, and starts by locking the delivery person's row (`SELECT ... FOR UPDATE`) — the same lock delivery-person deletion takes before it counts linked orders (see `src/admin/delivery-persons/AGENTS.md`), so the two operations serialize instead of racing. A missing or inactive one raises `DELIVERY_PERSON_NOT_FOUND` / `DELIVERY_PERSON_INACTIVE`; if the delivery person is deleted in the gap between the lock and the write anyway, the FK violation (P2003) is translated to `DELIVERY_PERSON_NOT_FOUND` rather than surfacing as a 500. The field is written in the same guarded update that moves the status, mirroring how `statusReason` is persisted only for `CANCELLED`. The `deliveryPerson` embedded in order payloads is **not** shaped through the delivery-persons module's mapper — it stays a flat Prisma row (`addressStreet`, `addressNumber`, …), unlike the nested `address` object the delivery-persons endpoints return. It is included whole (`include: { deliveryPerson: true }`), password hash and all; that openness is the documented admin-surface trade, not an oversight — see `src/admin/delivery-persons/AGENTS.md`.
- **Delivery-person reassignment**: a dedicated endpoint (`PATCH :orderId/delivery-person`) reassigns the delivery person on any order past preparation — `SHIPPED`, `DELIVERED`, or `CANCELLED` (an order cancelled before shipping never had one, so there the operation sets rather than swaps); `PENDING`/`PREPARING` are rejected with `ORDER_NOT_SHIPPED`, since they have no delivery person yet. It runs the same assignment validation as the `SHIPPED` transition (row lock, exists/active check, P2003 translation) and writes through a guarded update keyed on the order's current status, so a concurrent transition surfaces as `ORDER_INVALID_STATUS_TRANSITION`. No order events are emitted — the status does not change — and the response is the updated order with computed totals, not the management board. Because the write bumps the order's `updatedAt`, reassigning an old `DELIVERED`/`CANCELLED` order pulls it back into the board's recent-activity window — intentional, since a reassignment is recent order activity.
- **No create/delete**: orders are never created or deleted from the admin surface — only listed and transitioned.

---

## Conventions

| Rule | Detail |
|---|---|
| Status via state machine | Never an unchecked status update; always through the allowed-transition map |
| Stock-affecting transitions | Run inside a transaction with guarded updates |
| Side effects via events | Stock-ledger and notifications are decoupled through order events, emitted only after the transaction commits |
| A total always runs on the net products total | `productsTotal - productsDiscount - couponDiscount + deliveryFee`, everywhere a total is derived — including the sort path |
| Computed sorts in memory | Totals and item quantities are sorted via a two-step fetch |
| Delivery person is assigned on the shipped transition and reassigned via a dedicated endpoint | `deliveryPersonId` is required when moving an order to `SHIPPED`; afterwards it can be changed via `PATCH :orderId/delivery-person` on any status past preparation |
| Relation includes are bare | The delivery-person relation is included whole; the admin surface deliberately does not project its credential hash away |
