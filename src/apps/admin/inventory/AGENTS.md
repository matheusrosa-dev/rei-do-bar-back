# AGENTS.md — src/apps/admin/inventory/

## What belongs here

The inventory ledger and admin stock adjustments: listing stock movements, and incrementing (restock) or decrementing (removal) product stock. Also the listener that records the stock movements driven by the order lifecycle.

## What does NOT belong here

- Product catalog management (CRUD, ordering, soft-delete) → the products sub-module.
- The order-flow stock decrement on order creation → owned by the order modules; this sub-module only **records** the resulting movement via its listener.

---

## Core Patterns

- **Ledger model**: every stock change appends an immutable movement record (with its line items) tagged with an **origin**. Quantities are stored as **positive integers** — the origin, not the sign, encodes the direction (order creation and admin removal reduce stock; order/admin cancellation and admin restock increase it).
- **Order-driven movements**: an event listener reacts to order created/cancelled events and writes the movement. The cancelled event carries the origin so the listener does not infer it.
- **Admin-driven movements**: restock and removal mutate stock and write the movement **inside the same transaction**. Restock takes a **`totalCost` per line** (not a unit price) and stores the derived, rounded unit cost (`Math.round(totalCost / quantity)`) — the column is an integer, so the division is always rounded before persisting; removal snapshots the product's current sale price.
- **Atomic stock mutation**: both directions use a guarded conditional update filtered on non-deleted products. Decrement additionally guards on `stockQuantity >= quantity`; on a zero-row result, a follow-up lookup distinguishes "product not found" from "insufficient stock", each mapped to an `adminInventory` error. Increment uses the same guard, where a zero-row result can only mean "not found". Soft-deleted products are treated as not-found by both.
- **Duplicate guard**: a batch is rejected up front when the same product appears twice, so a single movement can never carry two lines for the same product.
- **Listing**: movements are returned paginated (newest first) with their order and product relations, following the standard page-object contract. Filterable by `origin` and by a set of product ids.

---

## Conventions

| Rule | Detail |
|---|---|
| Positive quantities | Movement quantity is always positive; direction comes from the origin |
| Atomic admin adjustments | Stock update and ledger write share one transaction |
| Guarded decrement | Distinguish not-found from insufficient stock via a follow-up lookup |
| Reject duplicates early | Validate product uniqueness in a batch before writing |
| Errors | Throw `AppException` with `adminInventory` codes; values live in the API contract reference |
