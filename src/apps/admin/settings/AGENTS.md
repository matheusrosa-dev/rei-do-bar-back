# AGENTS.md — src/apps/admin/settings/

## What belongs here

Admin management of runtime settings: reading every setting and updating a setting's value or toggling its active flag, keyed by the `SettingKey` enum.

## What does NOT belong here

- The client-facing read of active settings (delivery fee, alerts, etc.) → the store app's settings module (`src/apps/store/settings/`).

---

## Core Patterns

- **Fixed key set**: settings are not created or deleted here — the set of keys is defined by the `SettingKey` enum. Operations are limited to reading all, updating a value, and activating/deactivating.
- **Listing**: reading all settings returns a **flat array** — no pagination, no filters, no sort input — ordered by `key`. That ordering is the one in this app that needs no unique tiebreaker and carries none: `key` is itself `@unique`, so there are no ties to resolve. Adding a second sort criterion here would be the change that breaks the guarantee, not the one that upholds it.
- **Keyed by enum**: endpoints address a setting by its `SettingKey`, not by a generated id.
- **Activate/deactivate**: toggling the active flag controls whether the client-facing read surfaces the setting. Both toggles return **no body** — unlike the update, which returns the updated row.
- **String values, validated by type**: every setting holds a plain string in `value`. The DTO can only check `@IsString()` — what a valid value looks like depends on the row's `SettingType`, which the request doesn't carry — so `updateSetting` reads the persisted `type` and validates against it before writing. Today only `SettingType.CURRENCY` (`DELIVERY_FEE`, `MIN_ORDER_VALUE`, `WELCOME_COUPON`) is constrained: it must match a plain non-negative integer (no sign, separator, or symbol), or the update is rejected with `adminSettings.INVALID_SETTING_VALUE`. This gate is **load-bearing**: consumers parse these with `Number(...)`, and a non-numeric value would otherwise propagate as `NaN` into the cart total and `Order.couponDiscount`, surfacing as a Prisma failure at checkout instead of a validation error here. `TEXT` and `PHONE` values are still stored as-is, with no format check.
- **No Prisma error translation**: this service does not catch Prisma errors. Updating or toggling a key with no persisted row surfaces as a generic 500, not a domain not-found. Adding a route that can legitimately miss a row means adding the translation (via the `@shared/helpers/prisma-errors` predicates) along with it.

---

## The Welcome Coupon Setting

`WELCOME_COUPON` is the one setting with a downstream contract worth knowing before editing it:

- It is **not** exposed by the client-facing settings read — it is server-side only.
- `src/apps/store/coupons/` reads it as a discount amount in cents to compute a first-order discount; the update route now rejects a non-integer value up front, so it can no longer reach that consumer as `NaN`.
- The discount only applies when the setting is **active** and the customer has no prior non-cancelled orders (an anonymous cart qualifies by default).
- Order placement **revalidates** it. If a customer's cart carries the welcome discount but they are no longer eligible at checkout, the order is **rejected** with the orders module's welcome-coupon-unavailable error — deactivating or editing this setting can therefore fail in-flight checkouts, not just change future ones.

---

## Conventions

| Rule | Detail |
|---|---|
| No create/delete | The key set is fixed by the enum |
| Address by key | Routes are keyed by `SettingKey`, never by id |
| Validate against the persisted type | The DTO checks only `@IsString()`; `updateSetting` reads the row's `SettingType` and enforces the format — `CURRENCY` must be a plain non-negative integer |
| Client read elsewhere | Active-settings read lives in the store app's settings module |
| Ordered by a unique key | The listing sorts on `key`, which is `@unique` — the app-wide rule that every ordering ends on a unique column is satisfied outright, not exempted |
