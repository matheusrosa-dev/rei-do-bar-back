# AGENTS.md — src/apps/admin/delivery-persons/

## What belongs here

Admin delivery-person management: paginated listing (with an opt-in flat, unpaginated variant), single read, creation, full update, password assignment, **access revocation**, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Assigning a delivery person to an order → the admin orders sub-module, inside the status transition to `SHIPPED` and the reassignment endpoint; that operation is a property of the order, not of the delivery person.

---

## Core Patterns

- **Listing**: paginated, filterable by `isActive`, searchable by `name` / `phone` / `cpf` (case-insensitive `contains`). Sortable by creation date or by the order count — the allowed keys are declared on the listing DTO, and anything outside that set is a 422. The order count is a plain relation count, so it is sorted via `orderBy: { orders: { _count: direction } }` at the database level. Each item is enriched with `ordersCount` and with `hasSession`. An opt-in flag returns a flat, unpaginated list — every **active** row ordered alphabetically by name, mapped to the resource's plain shape (no `ordersCount`) — intended for pickers/selects rather than the paginated page object. The `isActive` filter is hard-coded there rather than optional: the list exists to populate an assignment picker, and an inactive delivery person is not assignable.
- **`hasSession` — a derived boolean, not a column.** The listing tells the operator who is actually logged into the delivery app, so that revoking access is not a shot in the dark. It is computed in the mapper from the session relation, fetched with an explicit `select` narrowed to the refresh expiry (never the whole row — it carries the token hashes), and the whole page is evaluated against a **single** `now` captured before the query.

  Two things make the naive implementations wrong, and both are load-bearing:

  | Naive check | Why it lies |
  |---|---|
  | `session !== null` | Session rows are **never** pruned. There is no logout endpoint, no expiry-driven delete, and no scheduled job — a row is only overwritten by a new login or removed by an admin write. So mere existence means "logged in at some point and never revoked". |
  | Comparing the **access** token expiry | That token lives minutes and lapses constantly during a normal shift; a delivery person actively working would read as `false`. |

  Use the **refresh** expiry: it is the same clock the refresh endpoint checks before letting a session continue, so the admin surface and the delivery app agree on what "logged in" means. Since refresh slides that expiry, an app in use keeps the flag `true` on its own. Note the endpoint gates on `isActive` **as well**, and the flag does not — an inactive delivery person can only ever read `false` because deactivation deletes the session in the same transaction, so the flag stays truthful only while that transaction stays intact.
- **Read shape**: every service method — listing, single read, create, update, activate/deactivate — returns the same shape via the mapper helpers in `helpers.ts`: the four flat `address*` columns are folded into a nested `address` object, mirroring the write DTO. The paginated listing **and** the single-read endpoint both carry `ordersCount`; the opt-in flat list, create/update/activate/deactivate do not (they don't fetch the relation count). `hasSession` is the one field the listing carries **alone** — see the conventions table.
- **Creation defaults**: new delivery persons start **active** — there is no client-facing listing, and the operator needs to be able to use them immediately.
- **Update**: covers `name`, `phone`, `cpf`, and the four address fields. Phone and CPF are both unique; a collision on either is rejected with the same `DELIVERY_PERSON_ALREADY_EXISTS` conflict.
- **Password**: the delivery person's login credential for the delivery app lives on this resource, on a dedicated write-only endpoint separate from the general update — the general update never touches it. The endpoint is a **full replacement**: sending a password again overwrites whatever was there, and there is no "current password" challenge (the admin sets it, the delivery person does not change it). The plaintext is hashed with the shared password helper before it reaches Prisma; **only the hash is ever persisted**.
- **Access revocation**: the delivery app authenticates with an opaque session token (see `src/apps/delivery-persons/auth/AGENTS.md`), and this resource owns the kill switch. Revoking is a **full credential wipe, not just a logout**: it clears `hashedPassword` *and* deletes the session row, in one transaction. Deleting the session alone would only buy minutes — the delivery person still knows the password and can log straight back in — so the password goes with it, and the admin has to assign a new one through the password endpoint before that person can log in again. `POST :deliveryPersonId/revoke-access` runs that wipe for one person and returns 204 — **idempotent**, since revoking someone who is not logged in (or who has no password) is not an error, though a missing delivery person is still a 404, translated from the update's P2025 rather than from a separate existence check. `POST revoke-access` (no id) is the fleet-wide variant: an unfiltered `updateMany` clearing every password plus an unfiltered `deleteMany` of every session, both in one transaction, returning 204 — it takes no input and therefore never 404s, and an empty table is a normal no-op. The literal route is declared **before** its parameterized sibling in the controller; the two differ in segment count so neither can shadow the other, but the order is kept defensive. Revocation is also **implicit** on two other writes, both of which go through the same private helper that updates the row and deletes the session **in one transaction** (the per-person revoke endpoint is one of its three call sites, passing `hashedPassword: null` as the update):

  | Operation | Why the session dies with it |
  |---|---|
  | Password write | A rotated credential must not leave the old token valid |
  | Deactivate | Cutting someone off has to take effect immediately, not in five minutes |
  | Delete | Falls out of the FK's `ON DELETE CASCADE` — no code needed |

  Note the asymmetry between the two implicit paths and the explicit endpoint: a password write and a deactivation keep the credential (the first replaces it, the second leaves it intact so reactivation restores a usable login), while the explicit revoke destroys it. Activation deliberately does **not** revoke: there is no session to kill (deactivation already removed it) and nothing about re-enabling someone invalidates a credential. The delivery-person guard re-checks `isActive` on every request anyway, so a session surviving any of these paths still cannot be used.
- **`hashedPassword` is returned on the admin surface, deliberately.** Queries here fetch the whole row and `mapDeliveryPerson` passes it through, so the column appears in *every* admin response of this resource — listing, single read, create, update, password write, and the toggles — and in the `deliveryPerson` relation other admin modules include. This is an accepted call: the admin surface is operator-only behind Basic Auth, and treating the row as opaque is not worth the projection bookkeeping at every call site.

  What that buys the attacker is bounded but real: the hash is bcrypt (cost 10), so it is not a usable credential, but anyone who reaches an admin response — a leaked log line, a cached payload, stolen admin credentials — can take the hashes offline and crack weak passwords at leisure. The mitigation is the password policy and admin-credential hygiene, **not** the response shape. If that trade ever stops being acceptable, put the projection back in `mapDeliveryPerson` (one place) rather than sprinkling `omit` across queries — and note the delivery-app surface never returns it either way, since `DeliveryPersonsOrdersDto` exposes an explicit field list.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. There is no cascade on deactivation (deactivating a delivery person does not unassign them from past orders).
- **Deletion**: delivery persons are **hard-deleted**, inside a transaction that locks the row (`SELECT ... FOR UPDATE`) before counting linked orders and deleting — the same lock the order module takes before assigning or reassigning a delivery person (see `src/apps/admin/orders/AGENTS.md`), so the two operations serialize instead of racing. If the linked-orders count is bypassed anyway, the FK on `orders.delivery_person_id` (`ON DELETE RESTRICT`) is the second line of defense, and its P2003 violation is translated to the same `DELIVERY_PERSON_HAS_ORDERS` conflict rather than surfacing as a 500.
- **Prisma error translation**: creation and the update helper translate the unique-constraint error into the same conflict `AppException`. The P2002 violation does not distinguish which field collided, so the message covers both phone and CPF. Deletion additionally translates the foreign-key-constraint error (P2003) via `isForeignKeyConstraintViolation`.

---

## Field Constraints

- `name` — 1–100 chars.
- `phone` — exactly 11 digits (no formatting). Unique.
- `cpf` — exactly 11 digits (no formatting, no checksum validation). Unique.
- `address` — nested object with `street` (1–100), `number` (1–10), `neighborhood` (1–100), `zipCode` (8 digits). Validated with the same rules as a customer's address.
- `password` — **not part of create**, 8 chars minimum: a delivery person is created without one and simply cannot log in until the admin sets it through the dedicated endpoint. Write-only. The upper length bound (72) approximates bcrypt's 72-**byte** input limit (the validator counts characters, so accented pt-BR text can still exceed it and be silently truncated by bcrypt — harmless, since hashing and verification truncate identically). Do not raise the bound, and keep the delivery-app login DTO's bounds identical to these.

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete, row-locked | Deletion locks the delivery person row before counting linked orders, serializing against a concurrent assignment or reassignment |
| Active on create | New delivery persons are immediately usable — no client-side listing means the inactive default is not needed |
| Unique-constraint translation | Both phone and CPF collisions map to the same `DELIVERY_PERSON_ALREADY_EXISTS` error |
| No cascade on deactivate | Past orders keep their reference; the deactivated person is no longer assignable to new orders |
| FK protects races | `orders.delivery_person_id` is `ON DELETE RESTRICT`; the row lock is the first line of defense, the FK (translated to `DELIVERY_PERSON_HAS_ORDERS`) is the second |
| One shape across the resource | The mappers in `helpers.ts` nest the address on every response; listing and single-read both add `ordersCount` |
| `hasSession` is listing-only, deliberately | The single read does not fetch the session relation and does not carry the field. That asymmetry is a decision, not an oversight — do not "fix" it by widening the shared mapper; a third mapper exists precisely so the other call sites keep working off rows that have no session to report |
| Password is write-only, its hash is not | The plaintext is hashed before persisting and never readable; the resulting `hashedPassword` **is** returned by this resource's endpoints, by design |
| Password on its own endpoint | The general update never writes the credential; the dedicated endpoint overwrites it wholesale |
| Credential changes revoke the session | Password write and deactivation delete the delivery app's session in the same transaction as the update; revocation also has its own idempotent endpoint |
| Revocation also clears the password | Both revoke endpoints null out `hashedPassword` alongside the session delete — a revoked delivery person cannot log back in until the admin assigns a new password |
| Fleet-wide revocation never 404s | `POST revoke-access` takes no id, so unlike its per-person sibling it has no existence check and no error path — it always returns 204 |
