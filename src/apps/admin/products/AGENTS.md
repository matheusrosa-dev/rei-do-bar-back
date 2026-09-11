# AGENTS.md — src/apps/admin/products/

## What belongs here

Admin catalog management for products: catalog-tree listing, single-product read, creation, update, activation/deactivation, guarded deletion, and the **manual ordering of the products inside every category group**.

## What does NOT belong here

- Stock mutations (restock/removal) and the inventory ledger → the inventory sub-module.
- Client-facing product listing (the catalog) → the store app's products module (`src/apps/store/products/`).
- Ordering of the category groups themselves, and of the categories inside a group → the category-groups sub-module. Only the products' own `sortOrder` is written here.

---

## Core Patterns

- **Listing**: the default list returns the **whole catalog tree** — every category group, ordered by `sortOrder` then id, each carrying an embedded `products` array of its non-deleted products ordered by `sortOrder` then id, every product including its `category`. It is not paginated and accepts no filter, search, or sort parameter. Products are ordered once and bucketed into their group by the category's group id, so the id tiebreaker still resolves a product that shares a `sortOrder` with one from another group (possible whenever a product is created or re-categorized — see *Creation defaults*). An opt-in flag returns a flat, unpaginated product list intended for pickers/selects rather than the tree. It sorts by `name`, which is not unique, so it ends on the id as well — nothing can be lost without a slice, but a picker that reshuffles between requests is still a defect on screen. The `findFirst` that reads the highest `sortOrder` on create is the one ordering with no tiebreaker, and needs none: it selects that column alone, so any tied row answers identically. That read is **scoped to the category group** — see *Creation defaults*.
- **Creation defaults**: new products start **inactive and with zero stock**, so they are invisible to clients until explicitly activated and stocked. The new product's `sortOrder` is `max(sortOrder) + 1` **among the non-deleted products whose category belongs to the same category group** — it lands at the end of its group's block, not at the end of the whole catalogue. The group id comes from a pre-check (`findCategoryGroupIdOrThrow`) that reads the category before the write and raises the resource's invalid-category error when it does not exist; the create's own not-found translation stays as a second guard. **Only creation and the category change on update are group-scoped**: the store listing still orders by `sortOrder` globally, so a freshly created or re-categorized product can share a `sortOrder` with a product from another group.
- **Update re-appends on category change**: the update endpoint takes a required `categoryId`, and whenever the submitted one **differs from the product's current category**, the product is moved to the end of its (new) category's group — `max(sortOrder) + 1` among the other non-deleted products of that group, the product itself excluded so a product already last keeps its value. The rule fires on any category change, **including a move between two categories of the same group**; submitting the same `categoryId` leaves `sortOrder` untouched. The group lookup reuses the create pre-check, so changing to a category that does not exist raises the invalid-category error here too.
- **Manual ordering is every group, in one call**: `PUT sort-order` takes a `categoryGroups` array of `{ categoryGroupId, products: [{ productId }] }` — a **full snapshot** of the catalog's products, not a delta, mirroring the category-groups reorder payload. The products hang off the **group**, not the category, because a product's `sortOrder` is scoped to its category's group (the same scope *Creation defaults* uses) and because the listing embeds them that way. There is no `sortOrder` field on the payload: **array position is the order**. Validation is two permutation checks through the shared `isExactPermutation` helper (`@shared/helpers/permutation` — same size, no duplicate, all exist), the same one the category-groups reorder uses: the group ids must be an exact permutation of every existing group → invalid-group-order (400); then, **per group**, the submitted product ids must be an exact permutation of that group's non-deleted products → invalid-products-order (400). The per-group check is what makes moving a product to another group inexpressible, and a group with no products must still be sent, with an empty `products` array. Both are 400 and a failure applies nothing. The persisted `sortOrder` is `index + 1` within each group, written in one array-form `$transaction` (`sort_order` has no unique constraint, so no staging pass), and `categoryId` is never written. The reorder answers with the catalog-tree listing itself, so the two reads never drift apart. The body is wrapped in an object rather than a bare top-level array because the global `ValidationPipe` cannot validate a root-level array; nested items use `@ValidateNested` + `@Type`, so a malformed item is a 422, never a domain error.
- **Activate/deactivate**: both toggles funnel through a shared private helper that translates the Prisma "record not found" error into the resource's `AppException`. **Activation adds a rule**: a product cannot be activated while its category is inactive — that raises the resource's inactive-category conflict error. Deactivating a category does not mirror this — it leaves its products untouched, so an inactive category can hold active products.
- **Deletion**: products are **soft-deleted** (deletion timestamp set, sort order reset to `-1`) and their cart references are removed atomically in one transaction; reads always filter out soft-deleted rows.
- **Prisma error translation**: only the "record not found" case applies here (products have no unique business column). Note it maps to **two different codes depending on the operation**: on create, a missing row means the supplied `categoryId` does not exist, so it becomes an *invalid category* error; everywhere else it becomes *product not found*.

---

## Conventions

| Rule | Detail |
|---|---|
| Default listing is the catalog tree | Every category group (ordered by `sortOrder`+id) with its non-deleted products embedded and ordered the same way, each product including its category — not paginated, no filters or sort key |
| No stock writes here | Stock quantity is mutated only by the inventory sub-module and the order flow |
| Soft delete | Deletion is logical; every read filters out deleted rows |
| Inactive on create | New catalog entries are hidden until explicitly activated |
| Create appends within the group | A new product's `sortOrder` is the next value among the products of its category's group, not the global next |
| Category change re-appends | Changing a product's category sends it to the end of the new category's group, same group included |
| No activating a product under an inactive category | Activation is refused while the parent category is inactive |
| Reorder covers every group in one call | One payload carries all groups with their products; what stays in the category-groups module is the order *of the groups* and *of the categories* |
| Reorder all-or-nothing | The payload must cover every group id exactly once **and**, inside each group, exactly that group's non-deleted product ids — a product never moves between groups |
| `sortOrder` comes from array position | On manual reorder, the client never sends this column; the item's index (`+1`) is what gets persisted |
