# AGENTS.md — src/admin/customers/

## What belongs here

Admin customer oversight: paginated listing, single-customer read, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Customer self-management (profile, addresses) → the authenticated customer module.
- Customer creation → customers are created through the auth/OTP flow, never here.

---

## Core Patterns

- **Read-only management surface**: this sub-module never creates or edits customer profile data; it only lists, inspects, toggles status, and deletes.
- **Listing**: paginated, filtered, and searchable by name / phone / id; soft-deleted customers are excluded. Items are enriched with the customer's main address and three order counts (all, cancelled, delivered). Sorting by the **total** order count is done at the DB level (`orderBy` on the relation `_count`); sorting by the **delivered** count cannot be expressed that way — it is a filtered count — so it falls back to the in-memory two-step fetch.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. The toggle returns the **full customer row**, personal fields included — admin routes have no serialization interceptor and the query does not narrow with a `select`.
- **Deletion**: customers are **hard-deleted** (a physical `delete`), and only after a pre-check proves no orders exist; otherwise a conflict error is thrown. **No anonymization happens here** — nothing is scrubbed and the soft-delete timestamp is never set. The anonymization path (blank the personal fields, rewrite the phone to a placeholder, keep the row so orders survive) belongs to customer **self**-deletion in the `me/` module. The two deletion semantics are deliberately different: a customer with orders cannot be removed from here at all, which is precisely the case `me/` has to solve.
- **Detail read**: returns the customer together with **all** addresses and **all** orders with their items — full personal data by design, since that is the point of the admin detail screen.

---

## Conventions

| Rule | Detail |
|---|---|
| No profile writes | Admin never mutates customer profile fields |
| Hard delete with pre-check | Block deletion when orders exist; deletion here is physical, never anonymizing |
| PII is returned in full | Admin responses carry personal data by design — there is no serialization layer narrowing them. Treat the whole surface as privileged and never reuse these query shapes on a client-facing route |
