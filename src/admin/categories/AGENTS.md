# AGENTS.md — src/admin/categories/

## What belongs here

Admin category management: listing, creation, update, activation/deactivation, manual ordering, and guarded deletion.

## What does NOT belong here

- Client-facing category reads → the top-level categories module.

---

## Core Patterns

- **Listing is NOT paginated**: unlike every other admin resource, this endpoint returns a **flat array** of all categories (newest first) — no page/limit, no pagination metadata, no free-text search, no sort key. The only filter is `isActive`. Each item is enriched with `productsCount` (its non-deleted products).
- **Creation defaults**: new categories start **inactive** so they are not exposed to clients until activated.
- **Manual ordering**: a dedicated fetch returns the orderable set, and a bulk reorder endpoint persists a new sequence. The submitted id list must be an exact permutation of **all** existing category ids — a partial or duplicated list is rejected with the resource's invalid-order error rather than being partially applied.
- **Activate/deactivate**: a shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`. **Deactivation cascades**: it also deactivates every active product in the category, in the same update. This is the counterpart of the products rule that refuses to activate a product under an inactive category — the two together keep the invariant that no active product ever hangs off an inactive category.
- **Deletion**: categories are **hard-deleted**, but only after a pre-check proves no dependent products exist; otherwise a conflict error is thrown. The pre-check does **not** filter out soft-deleted products, so a category whose only products were soft-deleted still cannot be deleted.
- **Prisma error translation**: creation translates the unique-constraint error into a conflict `AppException`. **Update does not** — renaming a category onto an existing name currently surfaces as a generic 500. Add the translation if you touch that path.

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete with pre-check | Block deletion when dependents exist instead of cascading blindly |
| Inactive on create | New categories are hidden until explicitly activated |
| Deactivation cascades | Deactivating a category deactivates its products — never leave an active product under an inactive category |
| Reorder all-or-nothing | The reorder payload must cover every category id exactly once |
