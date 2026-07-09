# AGENTS.md — src/admin/coupons/

## What belongs here

Admin coupon management: paginated listing, single-coupon read, creation, update, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Coupon redemption rules (availability, discount calculation, usage limits) → the shared coupons module (`src/coupons/`); assigning/removing a coupon on a cart → the cart module; revalidation and usage recording at order placement → the orders module.

---

## Core Patterns

- **Listing**: paginated, with an optional active filter, free-text search (code/id), and DB-level sorting on orderable columns.
- **Creation defaults**: new coupons start **inactive** so they cannot be redeemed until explicitly activated.
- **Unique code**: the coupon `code` is unique; create/update translate the Prisma unique-constraint error into a conflict `AppException`.
- **Date range**: when an `endsAt` is provided, it must be strictly after `startsAt`. This is enforced at the **DTO level** (`IsAfterDate`, a custom cross-field `class-validator` decorator in `src/admin/coupons/validators/`), not in the service — it's a stateless check over the request's own fields, so it doesn't need an `AppException` code; violations surface as a standard `class-validator` 422.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. **Deactivation** is the exception: it also detaches the coupon from every cart currently referencing it (`Cart.couponId` set to `null`), atomically in the same transaction, so a deactivated coupon can never keep discounting an already-loaded cart.
- **Deletion**: coupons are **hard-deleted**; the "record not found" Prisma error becomes a not-found `AppException`.
- **Monetary values**: `discountValue` (for fixed discounts) and `minOrderValue` are integers in cents; `discountValue` for percentage discounts is a whole-number percentage.
- **Prisma error translation**: known Prisma errors (not-found, unique) become domain `AppException`s and never leak.

---

## Conventions

| Rule | Detail |
|---|---|
| Inactive on create | New coupons are unusable until explicitly activated |
| Unique code | Duplicate codes raise a conflict error |
| Hard delete | Deletion is physical; not-found becomes an `AppException` |
