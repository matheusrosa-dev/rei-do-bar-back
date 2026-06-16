# AGENTS.md — src/settings/

## What belongs here

The client-facing read of configurable runtime settings: a single read-only endpoint that returns the currently **active** settings as a flat key/value map (delivery fee, alert message, minimum order value, break/business-hour flags, etc.).

The service is also injected by other feature modules (cart, orders) to read individual values — e.g. the delivery fee — so its `SettingsService` is exported from the module.

## What does NOT belong here

- Updating settings or toggling their active flag → the admin settings sub-module.
- The persisted `SettingKey` / `SettingType` definitions → the Prisma schema.

---

## Key Design

`findAll()` loads every `Setting` row and reduces it to a `Record<SettingKey, string>`, **keeping only active settings**. Inactive settings are absent from the map, so consumers must treat a missing key as "not configured" and fall back to a sensible default (e.g. a delivery fee of `0`) rather than throwing.

Values are stored as strings; numeric settings (delivery fee, minimum order value) are stored in **cents** and parsed by the consumer.

---

## DTOs

The response DTO exposes each `SettingKey` as an optional field and is applied at the controller class level, so only known keys are serialized.

---

## Conventions

| Rule | Detail |
|---|---|
| Read-only | This module never writes settings; mutations live in the admin sub-module |
| Active-only | Only active settings are returned; missing key means "not configured" |
| Default on absence | Consumers fall back to a default instead of throwing on a missing key |
| Monetary values | Currency settings are stored/handled in cents; divided only when formatting |
| Exported service | `SettingsService` is exported for cart/orders to read individual values |
