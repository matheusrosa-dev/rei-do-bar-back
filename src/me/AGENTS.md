# AGENTS.md — src/me/

## What belongs here

Operations a **logged-in customer** performs on their own account:
- Fetching and initializing their profile.
- Updating their name.
- Managing their delivery addresses (add, remove, update, set main).
- Deleting their own account.

## What does NOT belong here

- Admin operations on customers → the admin customers sub-module.
- Anonymous-customer management → the auth module.
- Customer creation → the internal customers service.

---

## Auth Requirement

This module has **two controllers** — the profile controller (`me`) and a separate address controller (`me/address`, in `address.controller.ts`). Both are protected at class level by the access-token guard and serialized with the same response DTO; there is no public route here. Every service method receives the authenticated customer id from the current session.

---

## Central Pattern

Most service methods start by calling a private "load me or throw" helper to confirm the customer exists (excluding soft-deleted accounts), optionally including addresses. Mutations then proceed via nested Prisma writes on the customer's relations. (The profile update is the one deviation: it rejects a payload with no recognized fields *before* loading the customer, since there is nothing to load for.)

Every method returns the customer with addresses **sorted main-first** — clients rely on that ordering, so it is applied on the way out rather than left to the query.

**Profile initialization**: a distinct step from a profile update. It requires both a name and an address, creates that address as the main one, and refuses to run twice — a customer whose name is already set gets an "already initialized" error.

**Address management** (max **3** addresses per customer):
- Adding an address runs inside a transaction that takes a row lock on the customer (to serialize concurrent inserts), checks the database for a duplicate address (same postal code and number), enforces the address-count limit, demotes all existing addresses to non-main, and creates the new one as main — the newly added address always becomes the main address.
- Updating an address checks for duplicates in memory instead, excluding the address being updated from the comparison.
- Promoting an address to main rejects the no-op case — setting the already-main address as main is an error, not a silent success.
- Removing an address is blocked when it is the customer's only address; when the removed address was the main one (and others remain), the next address is promoted to main in the same write.

**Profile update**: the name is trimmed before validation and must contain a full name; an update with no recognized fields is rejected up front.

**Account deletion**: blocked when the customer has an order still in progress (status `PENDING`, `PREPARING`, or `SHIPPED`) — checked before any write. Otherwise it is a **soft delete by anonymization**, in one transaction: addresses, refresh tokens, push tokens, and the cart are deleted outright, while the customer row itself is *kept* so linked order history survives — personal fields scrubbed, deletion timestamp set, and the **phone rewritten to a unique placeholder** derived from the id. That last step is the subtle one: the phone column is unique, so without it the real number would stay occupied by a deleted account and the person could never sign up again.

Contrast this with admin customer deletion, which is a plain hard delete refused outright when orders exist (see `src/admin/customers/AGENTS.md`). The two are not the same operation.

---

## DTOs

The response DTO exposes profile fields plus a nested address collection (nested transformation is declared explicitly) and is applied at class level on **both** controllers. Route-param identifiers are validated as UUIDs.

Address field validation is shared across all three entry points (standalone add/update and the address nested inside profile initialization): `zipCode` is an 8-digit string, `street`/`neighborhood` are non-empty up to 100 chars, `number` up to 10 chars, and the optional `complement` is 5–255 chars when present.

---

## Conventions

| Rule | Detail |
|---|---|
| Existence check first | Methods resolve the customer or throw before mutating; soft-deleted accounts are treated as non-existent |
| One main address | Address mutations preserve exactly one main address, and responses always list it first |
| Nested writes | Address changes go through the customer's relation, not a separate address service |
| Deletion anonymizes, never erases | The customer row survives so orders keep their owner; the phone is freed via a placeholder |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
