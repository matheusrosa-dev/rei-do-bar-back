# AGENTS.md — src/categories/

## What belongs here

Client-facing category listing: a single read-only endpoint that returns all active categories for display in the product browser.

## What does NOT belong here

- Category creation, activation, or deletion → `src/admin/categories/`
- Product listing → `src/products/`

---

## Endpoint

`GET /categories`

Requires a valid `x-device-id` header (passes through `DeviceIdGuard` — no `@Public()` applied). No JWT required. Returns all categories where `isActive: true`.

---

## File Structure

```
categories/
├── categories.module.ts
├── categories.service.ts
├── categories.controller.ts
├── dtos/
│   ├── index.ts
│   └── categories.dto.ts
└── __tests__/
    └── categories.service.spec.ts
```

---

## Response DTO (`CategoriesDto`)

`@Serialize(CategoriesDto)` applied at class level. Exposes only:

| Field | Notes |
|---|---|
| `id` | Category UUID |
| `name` | Singular form (e.g. "Cerveja") |
| `pluralName` | Plural form (e.g. "Cervejas") |

`isActive`, `createdAt`, `updatedAt` are excluded from the client response.
