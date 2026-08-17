# AGENTS.md — src/apps/admin/products/

## What belongs here

Admin catalog management for products: paginated listing, single-product read, creation, update, activation/deactivation, manual ordering, and guarded deletion.

## What does NOT belong here

- Stock mutations (restock/removal) and the inventory ledger → the inventory sub-module.
- Client-facing product listing (e.g. best-sellers) → the store app's products module (`src/apps/store/products/`).

---

## Core Patterns

- **Listing**: the default list is paginated and supports filters (`categoryId`, `isActive`), free-text search (name, description, id, category name), and DB-level sorting. The **only** sort key is `stockQuantity`; the default order is newest first. There is no in-memory sorting path in this sub-module. An opt-in flag returns a flat, unpaginated list intended for pickers/selects rather than the paginated page object.
- **Creation defaults**: new products start **inactive and with zero stock**, so they are invisible to clients until explicitly activated and stocked.
- **Manual ordering**: a dedicated fetch returns the orderable set, and a bulk reorder endpoint persists a new sequence inside a transaction. The submitted id list must be an exact, duplicate-free permutation of **all** non-deleted product ids — otherwise the resource's invalid-order error is raised and nothing is written.
- **Activate/deactivate**: both toggles funnel through a shared private helper that translates the Prisma "record not found" error into the resource's `AppException`. **Activation adds a rule**: a product cannot be activated while its category is inactive — that raises the resource's inactive-category conflict error. It is the counterpart of the category rule that cascades deactivation down to its products.
- **Deletion**: products are **soft-deleted** (deletion timestamp set, sort order reset to `-1`) and their cart references are removed atomically in one transaction; reads always filter out soft-deleted rows.
- **Prisma error translation**: only the "record not found" case applies here (products have no unique business column). Note it maps to **two different codes depending on the operation**: on create, a missing row means the supplied `categoryId` does not exist, so it becomes an *invalid category* error; everywhere else it becomes *product not found*.

---

## Conventions

| Rule | Detail |
|---|---|
| No stock writes here | Stock quantity is mutated only by the inventory sub-module and the order flow |
| Soft delete | Deletion is logical; every read filters out deleted rows |
| Inactive on create | New catalog entries are hidden until explicitly activated |
| No active product under an inactive category | Activation is refused while the parent category is inactive |
| Reorder all-or-nothing | The reorder payload must cover every non-deleted product id exactly once |
