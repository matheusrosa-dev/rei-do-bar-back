# AGENTS.md — src/apps/store/categories/

## What belongs here

Client-facing category listing: a single read-only endpoint that returns the active categories for display in the product browser.

## What does NOT belong here

- Category creation, activation, or deletion → the admin categories sub-module.
- Product listing → the products module.

---

## Behavior

The controller carries **no `StoreAuth`** — the listing is an open read, requiring neither an `x-device-id` header nor a JWT. That is a deliberate choice, not an omission: the category list is the same for every visitor and reveals nothing session-specific. It returns only active categories, ordered by an explicit sort field.

The response DTO is applied at the controller class level and exposes the identity, the two display names (singular and plural), and the image URL; internal flags and timestamps are excluded.

---

## Conventions

| Rule | Detail |
|---|---|
| Read-only | This module exposes a single listing endpoint and no mutations |
| Active-only | Only active categories are returned to clients |
| Explicit ordering | Categories are returned sorted by an explicit sort field |
| Response shaping | Controlled exclusively by the class-level serialization DTO |
