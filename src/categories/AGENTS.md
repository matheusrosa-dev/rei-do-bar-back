# AGENTS.md — src/categories/

## What belongs here

Client-facing category listing: a single read-only endpoint that returns the active categories for display in the product browser.

## What does NOT belong here

- Category creation, activation, or deletion → the admin categories sub-module.
- Product listing → the products module.

---

## Behavior

The endpoint requires a valid `x-device-id` header (it passes through the global device-id guard and is **not** marked public) and does not require a JWT. It returns only active categories, ordered by an explicit sort field.

The response DTO is applied at the controller class level and exposes only the client-relevant identity and display-name fields; internal flags and timestamps are excluded.

---

## Conventions

| Rule | Detail |
|---|---|
| Read-only | This module exposes a single listing endpoint and no mutations |
| Active-only | Only active categories are returned to clients |
| Explicit ordering | Categories are returned sorted by an explicit sort field |
| Response shaping | Controlled exclusively by the class-level serialization DTO |
