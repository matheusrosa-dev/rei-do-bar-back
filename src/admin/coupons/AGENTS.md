# AGENTS.md — src/admin/coupons/

## What belongs here

Admin coupon management: paginated listing, creation, update, activation/deactivation, and deletion. There is **no single-coupon read route** — the listing is the only read surface.

## What does NOT belong here

- Coupon redemption rules (availability, discount calculation, usage limits) → the shared coupons module (`src/coupons/`); assigning/removing a coupon on a cart → the cart module; revalidation and usage recording at order placement → the orders module.
- **The welcome coupon.** It is not a `Coupon` row and is not manageable here. It lives as a discount amount in cents in the `WELCOME_COUPON` runtime setting (edited through `src/admin/settings/`) and is evaluated by `src/coupons/`. Creating a real coupon whose code happens to be the welcome code does **not** make it the welcome coupon.

---

## Core Patterns

- **Listing**: paginated, filtered by `isActive` / `hasStarted` / `isFinished`, with free-text search on the **`code` only** (not the id), defaulting to `startsAt` ascending. Each item is enriched with three computed fields: `usageCount`, `hasStarted`, and `isFinished`. `usageCount` is sorted at the DB level via `orderBy: { usages: { _count } }`; determining which coupons have exhausted their usage limit needs a comparison between two columns, so it goes through a **raw SQL query** that returns the ids of the limit-reached coupons.
- **Creation defaults**: new coupons start **inactive** so they cannot be redeemed until explicitly activated.
- **Immutable, normalized code**: the coupon `code` is unique and is set **only at creation** — the update DTO has no `code` field, so a coupon's code can never change. The create DTO normalizes it (trim + uppercase) before validation, so the case-sensitive unique index behaves consistently regardless of how the admin typed it. A duplicate code on create is translated from the Prisma unique-constraint error into a conflict `AppException`.
- **Update rules** (all enforced in the service, each with its own error code): a coupon's `startsAt` cannot be edited once the coupon has already started, and any new `startsAt` must be in the future; a new `usageLimit` cannot be set at or below the number of usages already recorded, which would retroactively invalidate redemptions that already happened.
- **Date range**: when an `endsAt` is provided, it must be strictly after `startsAt`. This is enforced at the **DTO level** (`IsAfterDate`, a custom cross-field `class-validator` decorator in `src/admin/coupons/validators/`), not in the service — it's a stateless check over the request's own fields, so it doesn't need an `AppException` code; violations surface as a standard `class-validator` 422. Two further DTO-level behaviors: on create, `startsAt` must not be before today (`@MinDate` against the São Paulo start-of-day helper), and `endsAt` is transformed to the **end** of the given day so an end date is inclusive.
- **Activate/deactivate**: activation goes through the shared private helper that toggles the flag and translates the Prisma "record not found" error into the resource's `AppException`. **Deactivation** does not reuse it: it also detaches the coupon from every cart currently referencing it (`Cart.couponId` set to `null`), atomically in the same transaction, so a deactivated coupon can never keep discounting an already-loaded cart.
- **Deletion**: coupons are **hard-deleted**, with **no dependency pre-check** (unlike categories/customers) — the schema's cascade removes the usage records and nulls the coupon reference on carts and orders. The "record not found" Prisma error becomes a not-found `AppException`.
- **Monetary values**: `discountValue` (for fixed discounts) and `minOrderValue` are integers in cents; `discountValue` for percentage discounts is a whole-number percentage. The ceiling depends on `discountType`, so it can't live in the DTO alone: create and update both run a service-level assert (`assertDiscountValueIsValid`) that rejects a `PERCENTAGE` value above 100, raising `adminCoupons.INVALID_DISCOUNT_VALUE`. Without it, an over-100% coupon would make every product free — the redemption side caps the discount at the subtotal, so it never goes negative and never surfaces as an error on its own.

---

## Conventions

| Rule | Detail |
|---|---|
| Inactive on create | New coupons are unusable until explicitly activated |
| Unique, immutable code | Codes are set at creation only, normalized to uppercase; duplicates raise a conflict error |
| Discount ceiling by type | `PERCENTAGE` is capped at 100% by a service-level assert on create and update; the DTO only enforces a non-negative integer |
| Never rewrite history | A started coupon's `startsAt` is frozen, and `usageLimit` can never drop to or below the recorded usage count |
| Deactivation detaches | Deactivating must also null the coupon on every cart holding it, in the same transaction |
| Hard delete | Deletion is physical and unguarded; not-found becomes an `AppException` |
| Welcome coupon is not a coupon | It is a setting, not a row here — see `src/admin/settings/` and `src/coupons/` |
