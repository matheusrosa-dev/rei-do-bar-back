# AGENTS.md — src/admin/coupons/

## What belongs here

Admin coupon management: paginated listing, single-coupon read, creation, update, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Coupon validation/redemption during order placement → the client orders module (when implemented).

---

## Core Patterns

- **Listing**: paginated, with an optional active filter, free-text search (code/id), and DB-level sorting on orderable columns.
- **Creation defaults**: new coupons start **inactive** so they cannot be redeemed until explicitly activated.
- **Unique code**: the coupon `code` is unique; create/update translate the Prisma unique-constraint error into a conflict `AppException`.
- **Date range**: when an `endsAt` is provided, create/update assert it is strictly after `startsAt`, raising a bad-request `AppException` otherwise.
- **Activate/deactivate**: a single shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`.
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
