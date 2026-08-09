# AGENTS.md — src/admin/delivery-persons/

## What belongs here

Admin delivery-person management: paginated listing (with an opt-in flat, unpaginated variant), single read, creation, full update, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Assigning a delivery person to an order → the admin orders sub-module, inside the status transition to `SHIPPED`; that operation is a property of the order, not of the delivery person.

---

## Core Patterns

- **Listing**: paginated, filterable by `isActive`, searchable by `name` / `phone` / `cpf` (case-insensitive `contains`). Sortable by creation date or by the order count — the allowed keys are declared on the listing DTO, and anything outside that set is a 422. The order count is a plain relation count, so it is sorted via `orderBy: { orders: { _count: direction } }` at the database level. Each item is enriched with `ordersCount`. An opt-in flag returns a flat, unpaginated list — every row ordered alphabetically by name, mapped to the resource's plain shape (no `ordersCount`) — intended for pickers/selects rather than the paginated page object.
- **Read shape**: every service method — listing, single read, create, update, activate/deactivate — returns the same shape via the `mapDeliveryPerson`/`mapDeliveryPersonWithCount` helpers in `helpers.ts`: the four flat `address*` columns are folded into a nested `address` object, mirroring the write DTO. The paginated listing **and** the single-read endpoint both carry `ordersCount`; the opt-in flat list, create/update/activate/deactivate do not (they don't fetch the relation count).
- **Creation defaults**: new delivery persons start **active** — there is no client-facing listing, and the operator needs to be able to use them immediately.
- **Update**: covers `name`, `phone`, `cpf`, and the four address fields. Phone and CPF are both unique; a collision on either is rejected with the same `DELIVERY_PERSON_ALREADY_EXISTS` conflict.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. There is no cascade on deactivation (deactivating a delivery person does not unassign them from past orders).
- **Deletion**: delivery persons are **hard-deleted**, inside a transaction that locks the row (`SELECT ... FOR UPDATE`) before counting linked orders and deleting — the same lock the order status transition takes before assigning a delivery person (see `src/admin/orders/AGENTS.md`), so the two operations serialize instead of racing. If the linked-orders count is bypassed anyway, the FK on `orders.delivery_person_id` (`ON DELETE RESTRICT`) is the second line of defense, and its P2003 violation is translated to the same `DELIVERY_PERSON_HAS_ORDERS` conflict rather than surfacing as a 500.
- **Prisma error translation**: creation and the update helper translate the unique-constraint error into the same conflict `AppException`. The P2002 violation does not distinguish which field collided, so the message covers both phone and CPF. Deletion additionally translates the foreign-key-constraint error (P2003) via `isForeignKeyConstraintViolation`.

---

## Field Constraints

- `name` — 1–100 chars.
- `phone` — exactly 11 digits (no formatting). Unique.
- `cpf` — exactly 11 digits (no formatting, no checksum validation). Unique.
- `address` — nested object with `street` (1–100), `number` (1–10), `neighborhood` (1–100), `zipCode` (8 digits). Validated with the same rules as a customer's address.

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete, row-locked | Deletion locks the delivery person row before counting linked orders, serializing against a concurrent `SHIPPED` assignment |
| Active on create | New delivery persons are immediately usable — no client-side listing means the inactive default is not needed |
| Unique-constraint translation | Both phone and CPF collisions map to the same `DELIVERY_PERSON_ALREADY_EXISTS` error |
| No cascade on deactivate | Past orders keep their reference; the deactivated person is no longer assignable to new orders |
| FK protects races | `orders.delivery_person_id` is `ON DELETE RESTRICT`; the row lock is the first line of defense, the FK (translated to `DELIVERY_PERSON_HAS_ORDERS`) is the second |
| One shape across the resource | `mapDeliveryPerson`/`mapDeliveryPersonWithCount` in `helpers.ts` nest the address on every response; listing and single-read both add `ordersCount` |
