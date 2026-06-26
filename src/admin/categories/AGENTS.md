# AGENTS.md — src/admin/categories/

## What belongs here

Admin category management: paginated listing, creation, update, activation/deactivation, manual ordering, and guarded deletion.

## What does NOT belong here

- Client-facing category reads → the top-level categories module.

---

## Core Patterns

- **Listing**: paginated, with optional filters and free-text search.
- **Creation defaults**: new categories start **inactive** so they are not exposed to clients until activated.
- **Manual ordering**: a dedicated fetch returns the orderable set, and a bulk reorder endpoint persists a new sequence.
- **Activate/deactivate**: a single shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`.
- **Deletion**: categories are **hard-deleted**, but only after a pre-check proves no dependent records (linked products) exist; otherwise a conflict error is thrown.
- **Prisma error translation**: known Prisma errors become domain `AppException`s and never leak.

---

## Conventions

| Rule | Detail |
|---|---|
| Hard delete with pre-check | Block deletion when dependents exist instead of cascading blindly |
| Inactive on create | New categories are hidden until explicitly activated |
| Toggle responses | Expose only identity and status fields |
