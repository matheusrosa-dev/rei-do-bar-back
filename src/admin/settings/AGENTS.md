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
- **Structured values**: most settings hold a plain string, but `SettingType.COUPON` (currently only `WELCOME_COUPON`) holds a JSON-encoded object (`{ discountValue, minOrderValue }`, both in cents) inside `value`. Updates to a `COUPON`-typed setting are parsed and validated against that shape before being persisted — the payload is run through `class-transformer`/`class-validator` with unknown keys **forbidden**, so a malformed or extended object is rejected with the sub-module's `INVALID_SETTING_VALUE` error rather than being stored. This is the only domain error the sub-module raises.
- **No Prisma error translation**: this service does not catch Prisma errors. Updating or toggling a key with no persisted row surfaces as a generic 500, not a domain not-found. Adding a route that can legitimately miss a row means adding the translation (via the `@shared/helpers/prisma-errors` predicates) along with it.

---

## The Welcome Coupon Setting

`WELCOME_COUPON` is the one setting with a downstream contract worth knowing before editing it:

- It is **not** exposed by the client-facing settings read — it is server-side only.
- `src/coupons/` parses it to compute a first-order discount, and silently treats a malformed payload as "no welcome coupon" — which is exactly why the write path here validates strictly.
- The discount only applies when the setting is **active** and the customer has no prior non-cancelled orders.
- Order placement **revalidates** it. If a customer's cart carries the welcome discount but they are no longer eligible at checkout, the order is **rejected** with the orders module's welcome-coupon-unavailable error — deactivating or editing this setting can therefore fail in-flight checkouts, not just change future ones.

---

## Conventions

| Rule | Detail |
|---|---|
| No create/delete | The key set is fixed by the enum |
| Address by key | Routes are keyed by `SettingKey`, never by id |
| Validate structured values on write | A JSON-valued setting is validated (unknown keys forbidden) before persisting — consumers assume a well-formed payload |
| Client read elsewhere | Active-settings read lives in the top-level settings module |
