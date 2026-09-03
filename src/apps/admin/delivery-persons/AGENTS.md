# AGENTS.md — src/apps/admin/delivery-persons/

## What belongs here

Admin delivery-person management: paginated listing (with an opt-in flat, unpaginated variant), single read, a fleet-wide access probe, creation, full update, password assignment, **access revocation**, activation/deactivation, the **volunteer flag** toggle, and guarded deletion.

## What does NOT belong here

- Assigning a delivery person to an order → the admin orders sub-module, inside the status transition to `SHIPPED` and the reassignment endpoint; that operation is a property of the order, not of the delivery person.

---

## Core Patterns

- **Listing**: paginated, filterable by `isActive`, searchable by `name`/`phone`/`cpf` (case-insensitive `contains`). Fixed newest-first, no sort param — `ordersCount` (delivered only, a filtered relation count Prisma cannot `orderBy`) is why: sorting on it needs the two-step in-memory path the customers listing uses, not added lightly. Ends on `id` as tiebreaker. Each row adds `ordersCount` and `hasAccess`. The opt-in flat variant (`simple=true`) is hard-filtered to active rows with a `hashedPassword` (not the `hasAccess` disjunction — a live session with no password is a revoked credential, and the picker should stop offering them), sorted alphabetically, meant for assignment pickers.
- **`hasAccess`** is derived, not a column — the same question the fleet-wide probe answers at fleet scope. `true` when the row has a `hashedPassword` **or** a live session (the refresh-token expiry, not the access one — the access token lapses every few minutes during a normal shift and would false-negative), conjoined with `isActive`. Session rows are never pruned (no logout endpoint, no TTL job), so raw existence alone would over-report; deactivation clears both password and session in one transaction, so the `isActive` gate mostly agrees with the disjunction — it earns its place on rows deactivated **before** that wipe rule existed. The session half is fetched with a narrowed `select` (only the refresh expiry, never the token hashes) against one `now` captured before the query.
- **Access probe**: `GET has-access` → `{ hasAccess: boolean }`, true when **any active** delivery person has a password or a live session — same rule as the per-row flag, one query (`findFirst`, existential, `select: { id: true }`) instead of per-row. Declared **before** its `:deliveryPersonId` sibling (route order is load-bearing here, since both are single-segment `GET`s).
- **Read shape**: every method returning a delivery person (listing, single read, create, update, password write, toggles) returns the row as-is — there is no per-row mapper, since the resource has no derived or reshaped field on the base row. `ordersCount` is on listing and single read only (both via the shared delivered-orders selector, through `mapDeliveryPersonWithCount`); `hasAccess` is listing-only (the single read has no session `select` to compute it from, and adding it is a query change, not a mapper change).
- **Creation**: starts **active** — no client-facing listing means there is nothing to protect by defaulting inactive.
- **Update**: `name`, `phone`, `cpf`. Phone/CPF collisions both map to `DELIVERY_PERSON_ALREADY_EXISTS`.
- **Password**: a dedicated write-only endpoint, full replacement, no "current password" challenge. Hashed before persisting; only the hash is stored.
- **Access revocation**: a full credential wipe, not a logout — clears `hashedPassword` **and** deletes the session, in one transaction (deleting the session alone would leave the password usable). `POST :id/revoke-access` is idempotent (204, missing person is still a 404 via P2025) and `POST revoke-access` (no id) is the unfiltered fleet-wide variant (204, never 404s). Revocation is also implicit — same helper, same transaction — on:

  | Operation | Why the session dies with it |
  |---|---|
  | Password write | A rotated credential must not leave the old token valid |
  | Deactivate | Cutting someone off takes effect immediately |
  | Delete | `ON DELETE CASCADE` on the FK |

  Deactivation and the explicit/fleet revocation all clear `hashedPassword`, and so does **activation** — reactivating never silently restores a login; the admin must assign a new password after. Operational consequence: **activate first, then assign the password** — the password endpoint does not check `isActive`, so writing to an inactive row is wiped the moment it activates.
- **`hashedPassword` is returned on every admin response of this resource, deliberately** — the admin surface is operator-only behind Basic Auth, and narrowing the projection at every call site was judged not worth it. The exposure is bounded (bcrypt cost 10 — not directly usable, only crackable offline if a response leaks); the mitigation is password policy and admin-credential hygiene, not the response shape. If that trade is ever revisited, narrow it with a `select` on the queries, since there is no longer a per-row mapper to do it in one place.
- **Activate/deactivate** do not share a helper: activation is a plain update (no session to delete on an inactive row); deactivation goes through the revoking helper (see above). No cascade — past order references survive deactivation.
- **Volunteer flag** (`isVolunteer`): `PATCH :id/mark-volunteer` / `:id/unmark-volunteer`, both plain updates via the same not-found-translating helper as activation. It marks a delivery person who is settled outside this app. Its one reader is `admin/orders/`, which on every write of an order's delivery person — dispatch and reassignment alike — **freezes the flag onto the order** as `deliveryPersonIsVolunteer` (see `src/apps/admin/orders/AGENTS.md`). The order's `deliveryPersonBonus` is still stamped with the configured amount even for a volunteer, on purpose — the frozen flag is what lets a future consumer net those payouts out as a saving. Because the copy is frozen at assignment, unmarking someone here never rewrites their past orders. The delivery fee is untouched by it. Independent of `isActive` and access: a volunteer still logs in and works normally. No cascade, no session effect. Returned on every response of this resource.
- **Deletion**: hard delete inside a transaction that locks the row (`SELECT ... FOR UPDATE`) before counting linked orders — the same lock `admin/orders/` takes before (re)assigning a delivery person, so the two serialize. The FK (`ON DELETE RESTRICT`, translated from P2003) is the second line of defense.
- **Prisma error translation**: unique-constraint (P2002) on create/update → `DELIVERY_PERSON_ALREADY_EXISTS` (does not distinguish phone vs. CPF); foreign-key (P2003) on delete → `DELIVERY_PERSON_HAS_ORDERS`.

---

## Field Constraints

| Field | Rule |
|---|---|
| `name` | 1–100 chars |
| `phone` | Exactly 11 digits, no formatting. Unique |
| `cpf` | Exactly 11 digits, no formatting, no checksum. Unique |
| `password` | Not part of create (a new delivery person cannot log in until the admin sets one). 8–72 chars, write-only. The 72 bound approximates bcrypt's 72-**byte** limit (the validator counts characters, so pt-BR accents can still exceed it — harmless, hashing and verification truncate identically). Do not raise it; keep the delivery-app login DTO's bounds identical |

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete, row-locked | Locks the row before counting linked orders, serializing against a concurrent (re)assignment |
| Active on create | No client-facing listing to protect — new rows are immediately usable |
| Unique-constraint translation | Both phone and CPF collisions map to `DELIVERY_PERSON_ALREADY_EXISTS` |
| No cascade on deactivate | Past orders keep their reference; the person is just no longer assignable |
| Volunteer flag is bookkeeping-only | `isVolunteer` toggles via `mark-volunteer` / `unmark-volunteer`; it does not gate login, access, or assignment. Its one reader is `admin/orders/`, which on assignment freezes the flag onto the order (`deliveryPersonIsVolunteer`) — the bonus is still stamped normally; toggling it here does not touch past orders |
| FK protects races | Row lock is the first line of defense, the FK (`DELIVERY_PERSON_HAS_ORDERS`) is the second |
| One shape across the resource | The delivery-person row is returned as-is; `ordersCount` on listing + single read only, via the shared delivered-orders selector |
| `ordersCount` is delivered-only, everywhere | One module-level selector reused by every query reporting it — never inline a second `_count`, which would make the field mean two things across queries |
| No sort input on the listing | `ordersCount` has no cheap `orderBy` (filtered relation count) — adding a sort key means the customers listing's two-step in-memory path (ids + counts, deterministically ordered, then the page refetched by id) |
| `hasAccess` is listing-only | The single read has no session `select` to compute it from — omission is a choice, not a limitation; add the `select` there if ever needed |
| `hasAccess` and `GET has-access` are one rule, two scopes | Both gate on `isActive` and both disjuncts (password, live session) — change them together |
| Password is write-only; its hash is not | Persisted only as a hash; the hash itself **is** returned by this resource's endpoints |
| Password lives on its own endpoint | The general update never touches the credential |
| Credential changes revoke the session | Password write and deactivation delete the session in the same transaction as the update |
| Deactivation and revocation both wipe the password | Reactivating never silently restores a login on its own |
| Fleet-wide revocation never 404s | Takes no id, so no existence check — always 204 |
| The access probe's revocation stays unfiltered on purpose | It is the one path that also scrubs stale hashes on rows deactivated before the wipe rule existed — do not add `isActive` to its `updateMany`/`deleteMany` |
| Literal routes before parameterized ones | `has-access` must stay above `:deliveryPersonId` — both are single-segment `GET`s, so declaration order is what keeps the literal from being swallowed as an id |
