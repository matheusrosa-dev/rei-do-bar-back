# AGENTS.md — src/admin/products/

## What belongs here

Admin catalog management for products: paginated listing, single-product read, creation, update, activation/deactivation, manual ordering, and guarded deletion.

## What does NOT belong here

- Stock mutations (restock/removal) and the inventory ledger → the inventory sub-module.
- Client-facing product listing (e.g. best-sellers) → the top-level products module.

---

## Core Patterns

- **Listing**: the default list is paginated and supports filters, free-text search, and sorting (DB-level for orderable columns; in-memory two-step fetch for computed/relation values). An opt-in flag returns a flat, unpaginated list intended for pickers/selects rather than the paginated page object.
- **Creation defaults**: new products start **inactive and with zero stock**, so they are invisible to clients until explicitly activated and stocked.
- **Manual ordering**: a dedicated fetch returns the orderable set, and a bulk reorder endpoint persists a new sequence.
- **Activate/deactivate**: a single shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`.
- **Deletion**: products are **soft-deleted** (deletion timestamp set) and their cart references are removed atomically in one transaction; reads always filter out soft-deleted rows.
- **Prisma error translation**: known Prisma errors (not-found, unique) become domain `AppException`s and never leak.

---

## Conventions

| Rule | Detail |
|---|---|
| No stock writes here | Stock quantity is mutated only by the inventory sub-module and the order flow |
| Soft delete | Deletion is logical; every read filters out deleted rows |
| Inactive on create | New catalog entries are hidden until explicitly activated |
| Toggle responses | Expose only identity and status fields |
