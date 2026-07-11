# AGENTS.md — src/admin/settings/

## What belongs here

Admin management of runtime settings: reading every setting and updating a setting's value or toggling its active flag, keyed by the `SettingKey` enum.

## What does NOT belong here

- The client-facing read of active settings (delivery fee, alerts, etc.) → the top-level settings module.

---

## Core Patterns

- **Fixed key set**: settings are not created or deleted here — the set of keys is defined by the `SettingKey` enum. Operations are limited to reading all, updating a value, and activating/deactivating.
- **Keyed by enum**: endpoints address a setting by its `SettingKey`, not by a generated id.
- **Activate/deactivate**: toggling the active flag controls whether the client-facing read surfaces the setting.
- **Prisma error translation**: known Prisma errors become domain `AppException`s and never leak.
- **Structured values**: most settings hold a plain string, but `SettingType.COUPON` (currently only `WELCOME_COUPON`) holds a JSON-encoded object (`{ discountValue, minOrderValue }`, both in cents) inside `value`. Updates to a `COUPON`-typed setting are validated against that shape before being persisted.

---

## Conventions

| Rule | Detail |
|---|---|
| No create/delete | The key set is fixed by the enum |
| Address by key | Routes are keyed by `SettingKey`, never by id |
| Client read elsewhere | Active-settings read lives in the top-level settings module |
