# AGENTS.md — src/apps/admin/categories/

## What belongs here

Admin category management: listing, creation, update, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Client-facing category reads → the store app's products module (`src/apps/store/products/`), whose catalog endpoint embeds the categories of each group.
- Managing the groups themselves (their own CRUD, active flag, and ordering) → `src/apps/admin/category-groups/`. This module only references a group by id and checks that it exists.
- **Any ordering at all** — the categories' own `sortOrder` included → `src/apps/admin/category-groups/`. That module's single reorder endpoint rewrites the whole tree, so there is no `PUT /admin/categories/sort-order` and no ordering-oriented read here.

---

## Core Patterns

- **Listing is NOT paginated**: unlike every other admin resource, this endpoint returns a **flat array** of all categories (newest first, tied on the id) — no page/limit, no pagination metadata, no free-text search, no sort key. The tiebreaker matters even without pagination: the seed inserts every category in one `createMany`, so they share a `createdAt` to the millisecond and the whole listing is one tie set that would reshuffle between requests. It takes no query params — no filters at all. Each item is enriched with `productsCount` (its non-deleted products).
- **Single-item read**: `GET /:categoryId` returns one category by id, enriched with `productsCount` (its non-deleted products) like the listing plus the full `categoryGroup` relation (unlike the listing, which does not include it), and throws `CATEGORY_NOT_FOUND` (404) when the category does not exist.
- **Creation defaults**: new categories start **inactive** so they are not exposed to clients until activated.
- **Category group link**: only **create** takes a `categoryGroupId`, validated with a pre-check (`ensureCategoryGroupExists`) before the write — a missing group is rejected with the resource's invalid-category-group error rather than being left to the FK. The pre-check runs outside the write's `try`, which keeps the shared update helper's not-found translation unambiguous. The new category's `sortOrder` is the next value **within its group** (`max(sortOrder) + 1` filtered by `categoryGroupId`). **This module never changes either field again**: the update endpoint accepts only `name`, `pluralName` and `imageUrl`. A category's group is set at creation and remains fixed; reordering within a group happens only through the category-groups reorder endpoint (which never moves a category to a different group). The store listing still orders by `sortOrder` globally, so values repeat across groups there.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. Deactivating a category only flips its own flag — it does **not** touch the products in it, so an inactive category can still have active products. The products rule that refuses to activate a product under an inactive category is not mirrored here.
- **Deletion**: categories are **hard-deleted**, but only after a pre-check proves no dependent products exist; otherwise a conflict error is thrown. The pre-check does **not** filter out soft-deleted products, so a category whose only products were soft-deleted still cannot be deleted.
- **Prisma error translation**: both creation and the shared update helper translate the unique-constraint error into the same conflict `AppException` — renaming a category onto an existing name is rejected the same way a duplicate create is.

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete with pre-check | Block deletion when dependents exist instead of cascading blindly |
| Inactive on create | New categories are hidden until explicitly activated |
| Deactivation is flag-only | Deactivating a category leaves its products untouched |
| No category ordering surface | Neither `sortOrder` nor `categoryGroupId` is written after create — both belong to the category-groups reorder (which orders groups and their categories). Product ordering within a group happens in the products module |
| Group set only on create | The update endpoint cannot change a category's group; only the category-groups reorder moves one |
