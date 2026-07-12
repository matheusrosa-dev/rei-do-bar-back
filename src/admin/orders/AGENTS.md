# AGENTS.md — src/admin/orders/

## What belongs here

Admin order oversight: a status-grouped management board, a paginated/sortable listing, and status-transition management.

## What does NOT belong here

- Customer order placement and cancellation → the top-level orders module.
- Stock restock/removal and the inventory ledger → the inventory sub-module.

---

## Core Patterns

- **Two listings, different shapes**:
  - The **management board** is not a page object and not the full order set. It returns an object **keyed by order status**, where the ongoing statuses (pending, preparing, shipped) carry *all* their orders (oldest first, so the kitchen works a queue), while the finalized ones (delivered, cancelled) are a **recent-activity window only** — the last 4 hours, capped at 30, newest first. It is a live operations board, not an archive.
  - The **paginated listing** is the archive: filterable (status, payment type, free-text on customer name or exact order number), sortable, and paginated.
- **Totals**: the `total` returned for an order is `subtotal - discount + deliveryFee`. The discount is a snapshot on the order row (from a coupon or the welcome coupon).
- **Sorting**: `createdAt` is sorted at the DB level. `total` and item quantity are computed aggregates Prisma cannot order on, so they go through the in-memory two-step fetch (ids + computed value, then the page slice). The sort value for `total` uses the same formula as the returned total (`subtotal - discount + deliveryFee`) — keep them in sync if either changes.
- **Status state machine**: transitions are constrained by an explicit per-status map of allowed next statuses — pending → preparing/cancelled; preparing → shipped/cancelled; shipped → delivered/cancelled; delivered and cancelled are terminal. An already-finalized order or an illegal transition raises the corresponding `adminOrders` error. The transition runs as a guarded conditional update inside a transaction, and a zero-row result (the status changed concurrently) raises the invalid-transition error rather than silently passing. A status reason is persisted only when the target status is *cancelled*.
- **Cancellation side effects**: cancelling restores each item's stock inside the transaction. Both events — order-cancelled (carrying the admin-cancellation origin, so the inventory listener records the movement without inferring it) and status-updated (consumed by the notifications listener) — are emitted **after the transaction commits**, so a listener never observes a state the database has not accepted yet. The status endpoint returns the **refreshed management board**, not the updated order.
- **No create/delete**: orders are never created or deleted from the admin surface — only listed and transitioned.

---

## Conventions

| Rule | Detail |
|---|---|
| Status via state machine | Never an unchecked status update; always through the allowed-transition map |
| Stock-affecting transitions | Run inside a transaction with guarded updates |
| Side effects via events | Stock-ledger and notifications are decoupled through order events, emitted only after the transaction commits |
| A total always subtracts the discount | `subtotal - discount + deliveryFee`, everywhere a total is derived — including the sort path |
| Computed sorts in memory | Totals and item quantities are sorted via a two-step fetch |
