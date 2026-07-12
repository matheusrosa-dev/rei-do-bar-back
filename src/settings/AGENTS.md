# AGENTS.md — src/settings/

## What belongs here

The client-facing read of configurable runtime settings: a single read-only endpoint that returns the currently **active** settings as a flat key/value map (delivery fee, alert message, minimum order value, WhatsApp contact, break/business-hour flags).

The service is also exported and injected by other feature modules (cart, orders), which fetch the **whole map once** per request and pass it down — including into `CouponsService` for the welcome-coupon calculation. That is the convention: fetch the map at the edge of the flow and thread it through, rather than having each collaborator re-query settings.

## What does NOT belong here

- Updating settings or toggling their active flag → the admin settings sub-module.
- The persisted `SettingKey` / `SettingType` definitions → the Prisma schema.

---

## Key Design

`findAll()` loads every `Setting` row and reduces it to a `Record<SettingKey, string>`, **keeping only active settings**. Inactive settings are absent from the map, so consumers must treat a missing key as "not configured" and fall back to a sensible default (e.g. a delivery fee of `0`) rather than throwing.

Values are always stored as strings, in one of two flavors:

| Flavor | Keys | Parsing |
|---|---|---|
| Numeric (cents) | delivery fee, minimum order value, welcome coupon (`SettingType.CURRENCY`) | Parsed to an integer by the consumer; a non-numeric value yields `NaN` (not defended against — the admin write path is trusted to keep it valid) |
| Plain text | alert message, WhatsApp contact, on-break, outside-business-hours | Used as-is |

---

## DTOs

The response DTO is applied at the controller class level and, because serialization excludes anything not explicitly exposed, it doubles as the **client-visibility allowlist**.

It exposes six of the seven `SettingKey` values. The **welcome coupon is deliberately not exposed** — it is server-side configuration consumed by `CouponsService`, and the client learns about it only indirectly, through the `discount` / `couponCode` / `isWelcomeCoupon` fields on the cart. Adding a new key to the enum does **not** make it public; it becomes public only when added to this DTO.

---

## Conventions

| Rule | Detail |
|---|---|
| Read-only | This module never writes settings; mutations live in the admin sub-module |
| Active-only | Only active settings are returned; missing key means "not configured" |
| Default on absence | Consumers fall back to a default instead of throwing on a missing key |
| Monetary values | Currency settings are stored/handled in cents |
| Exposure is opt-in | A key reaches clients only by being exposed on the response DTO — not by existing in the enum |
| Fetch once, thread through | Consumers load the whole map and pass it to collaborators instead of re-querying |
