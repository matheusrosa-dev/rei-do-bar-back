# AGENTS.md — src/apps/admin/customers/

## What belongs here

Admin customer oversight: paginated listing (with an opt-in flat, unpaginated variant), single-customer read, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Customer self-management (profile, addresses) → the authenticated customer module.
- Customer creation → customers are created through the auth/OTP flow, never here.

---

## Core Patterns

- **Read-only management surface**: this sub-module never creates or edits customer profile data; it only lists, inspects, toggles status, and deletes.
- **Listing**: paginated, filtered, and searchable by name / phone / id; soft-deleted customers are excluded. Items are enriched with the customer's main address and three order counts (all, cancelled, delivered). Sorting by the **total** order count is done at the DB level (`orderBy` on the relation `_count`); sorting by the **delivered** count cannot be expressed that way — it is a filtered count — so it falls back to the in-memory two-step fetch. An opt-in flag returns a flat, unpaginated list — non-soft-deleted customers ordered alphabetically by name, without the enrichment — intended for pickers/selects rather than the paginated page object.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. The toggle returns the **full customer row**, personal fields included — admin routes have no serialization interceptor and the query does not narrow with a `select`.
- **Deletion**: customers are **hard-deleted** (a physical `delete`), inside a transaction that locks the customer row (`SELECT ... FOR UPDATE`) before counting orders and deleting — closing the race where an order gets created between the pre-check and the delete. If the count is bypassed anyway, the FK violation (P2003) is translated to the same `CUSTOMER_HAS_ORDERS` conflict rather than surfacing as a 500. **No anonymization happens here** — nothing is scrubbed and the soft-delete timestamp is never set. The anonymization path (blank the personal fields, rewrite the phone to a placeholder, keep the row so orders survive) belongs to customer **self**-deletion in the `store/me/` module. The two deletion semantics are deliberately different: a customer with orders cannot be removed from here at all, which is precisely the case `store/me/` has to solve.
- **Detail read**: returns the customer together with **all** addresses and **all** orders with their items — full personal data by design, since that is the point of the admin detail screen. Each order is enriched with its computed money (`productsTotal`, `productsDiscount`, `total`) through `computeOrderTotals` from `@shared/helpers/products-totals`, the same helper the orders modules use — the client must never re-derive a total from the raw row.

---

## Conventions

| Rule | Detail |
|---|---|
| No profile writes | Admin never mutates customer profile fields |
| Hard delete, row-locked | Deletion locks the customer row before counting orders, closing the race with concurrent order creation; deletion here is physical, never anonymizing |
| PII is returned in full | Admin responses carry personal data by design — there is no serialization layer narrowing them. Treat the whole surface as privileged and never reuse these query shapes on a client-facing route |
| Order money comes computed | The detail read never returns a raw order row; totals are attached server-side via the shared helper |
