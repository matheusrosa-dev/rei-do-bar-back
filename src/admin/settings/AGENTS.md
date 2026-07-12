# AGENTS.md — src/admin/settings/

## What belongs here

Admin management of runtime settings: reading every setting and updating a setting's value or toggling its active flag, keyed by the `SettingKey` enum.

## What does NOT belong here

- The client-facing read of active settings (delivery fee, alerts, etc.) → the top-level settings module.

---

## Core Patterns

- **Fixed key set**: settings are not created or deleted here — the set of keys is defined by the `SettingKey` enum. Operations are limited to reading all, updating a value, and activating/deactivating.
- **Keyed by enum**: endpoints address a setting by its `SettingKey`, not by a generated id.
- **Activate/deactivate**: toggling the active flag controls whether the client-facing read surfaces the setting. Both toggles return **no body** — unlike the update, which returns the updated row.
- **Opaque string values**: every setting holds a plain string in `value`, updated as-is with no per-type validation. The `value` field is validated only as `@IsString()`; the sub-module raises **no domain errors** of its own. Numeric settings (`SettingType.CURRENCY`, e.g. `DELIVERY_FEE`, `MIN_ORDER_VALUE`, `WELCOME_COUPON`) are trusted to be valid integers-in-cents — a bad value is parsed to `NaN` by the consumer, not rejected here.
- **No Prisma error translation**: this service does not catch Prisma errors. Updating or toggling a key with no persisted row surfaces as a generic 500, not a domain not-found. Adding a route that can legitimately miss a row means adding the translation (via the `@shared/helpers/prisma-errors` predicates) along with it.

---

## The Welcome Coupon Setting

`WELCOME_COUPON` is the one setting with a downstream contract worth knowing before editing it:

- It is **not** exposed by the client-facing settings read — it is server-side only.
- `src/coupons/` reads it as a discount amount in cents to compute a first-order discount; a non-numeric value becomes `NaN` downstream, so keep it a valid integer.
- The discount only applies when the setting is **active** and the customer has no prior non-cancelled orders (an anonymous cart qualifies by default).
- Order placement **revalidates** it. If a customer's cart carries the welcome discount but they are no longer eligible at checkout, the order is **rejected** with the orders module's welcome-coupon-unavailable error — deactivating or editing this setting can therefore fail in-flight checkouts, not just change future ones.

---

## Conventions

| Rule | Detail |
|---|---|
| No create/delete | The key set is fixed by the enum |
| Address by key | Routes are keyed by `SettingKey`, never by id |
| Values persisted as-is | `value` is validated only as a string; numeric settings are trusted to be valid cents |
| Client read elsewhere | Active-settings read lives in the top-level settings module |
