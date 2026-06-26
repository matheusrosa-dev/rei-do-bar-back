# AGENTS.md — src/admin/orders/

## What belongs here

Admin order oversight: a full management listing, a paginated/sortable listing, and status-transition management.

## What does NOT belong here

- Customer order placement and cancellation → the top-level orders module.
- Stock restock/removal and the inventory ledger → the inventory sub-module.

---

## Core Patterns

- **Two listings**: a management endpoint returns the full, freshly computed order set with totals; a separate endpoint returns a paginated, filterable, sortable page. Values Prisma can order on are sorted at the DB level; computed/relation values (e.g. order total) are sorted in application memory via a two-step fetch.
- **Status state machine**: transitions are constrained by an explicit per-status map of allowed next statuses. An already-finalized order or an illegal transition raises the corresponding `adminOrders` error. The transition runs as a guarded conditional update inside a transaction (a zero-row result means the status changed concurrently).
- **Cancellation side effects**: cancelling restores each item's stock inside the transaction, then emits an order-cancelled event (with an admin-cancellation origin) so the inventory ledger records the movement, plus a status-updated event consumed by the notifications listener.
- **No create/delete**: orders are never created or deleted from the admin surface — only listed and transitioned.

---

## Conventions

| Rule | Detail |
|---|---|
| Status via state machine | Never an unchecked status update; always through the allowed-transition map |
| Stock-affecting transitions | Run inside a transaction with guarded updates |
| Side effects via events | Stock-ledger and notifications are decoupled through emitted order events |
| Computed sorts in memory | Totals and relation counts are sorted via a two-step fetch |
