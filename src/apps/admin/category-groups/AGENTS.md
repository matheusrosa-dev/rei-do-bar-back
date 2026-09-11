# AGENTS.md — src/apps/admin/category-groups/

## What belongs here

Admin management of category groups — the bucket a category is filed under: listing, creation, update, activation/deactivation, guarded deletion, and the **tree-level ordering surface**: the order of the groups and the order of the categories inside each group (not products — see below).

## What does NOT belong here

- Category CRUD — creating, renaming, activating, deleting a category, and the pre-check that validates its group on **creation** → `src/apps/admin/categories/`. That module owns the FK and is the **only** place it is ever written; nothing here changes which group a category is filed under. What lives here instead is the *reordering* of groups and categories.
- Product ordering → `src/apps/admin/products/`. That module owns its own `PUT sort-order`, which takes the same full-snapshot shape and reorders the products of every group in one call; this module orders groups and categories, not products.
- Client-facing reads → `src/apps/store/products/`. Its `GET products/catalog` is the only surface that exposes category groups to the store app, and it is a read of the catalog tree (active groups > active categories > active products), not of this management surface.

---

## Core Patterns

- **Listing is NOT paginated**: like the categories listing, this endpoint returns a **flat array** of every group — no page/limit, no pagination metadata, no filter, no sort key. It is ordered by `sortOrder` and then the id, not newest-first as the categories listing is, because this module has no separate ordering fetch: the same read serves the management screen and the reorder screen. Each group embeds its `categories` — the full category objects, ordered by `sortOrder` then id — and each embedded category is enriched with `productsCount` (its active, non-deleted products — narrower than the categories listing's `productsCount`, which counts every non-deleted product).
- **Single-item read**: `GET /:categoryGroupId` returns one category group by id with its embedded `categories` (ordered by `sortOrder` then id), and throws `CATEGORY_GROUP_NOT_FOUND` (404) when the group does not exist. Unlike the listing, the embedded categories are **plain rows** — no `productsCount` enrichment.
- **Creation defaults**: a new group starts **inactive** and takes the next `sortOrder` (`max(sortOrder) + 1`) across **all** groups — the same `max + 1` probe the categories module runs, but global here rather than scoped, because a group has no parent to scope by. The client sends three fields: `name`, `allProductsImageUrl` (the image for the "Todos" pseudo-category), and `promotionsImageUrl` (the image for the "Promoções" pseudo-category, both validated with `@IsUrl()`). `sortOrder` is never client-supplied.
- **Activate/deactivate and update**: all three funnel through a shared private helper that applies the change and translates the Prisma "record not found" error into the resource's `AppException`. Deactivating a group only flips its own flag — it does **not** touch the categories filed under it, matching the categories module's own flag-only deactivation.
- **Manual ordering at the tree level**: `PUT sort-order` takes a `categoryGroups` array of `{ categoryGroupId, categories: [{ categoryId }] }` — a **full snapshot** of the groups and categories, not a delta. This endpoint orders **groups and categories only**, not products — products are ordered separately, through the products module's own reorder endpoint. There is no `sortOrder` field on the payload: **array position is the order** — the client reorders by reordering the arrays, nothing more. It performs both ordering operations at once: reordering the groups and reordering the categories inside each group. It **never moves a category between groups** — the grouping in the payload is descriptive, it must mirror what the database already holds, and `categoryGroupId` is not written. The body is wrapped in an object rather than being a bare top-level array, because the global `ValidationPipe` cannot validate a root-level array; the nested items are validated with `@ValidateNested` + `@Type`, so a malformed item is a 422, never a domain error.
- **Reorder validation is two permutation checks** run through the shared `isExactPermutation` helper (`@shared/helpers/permutation` — same three conditions: same size, no duplicate, all exist; the products reorder uses it too). The group ids must be an exact permutation of every existing group → the resource's invalid-group-order error. The categories are then checked **per group**: each group's submitted category ids must be an exact permutation of the categories that group actually holds → the resource's invalid-categories-order error. The per-group check is deliberately *not* global — that is exactly what makes moving a category between groups inexpressible; sending a category under a group that is not its own is rejected here. A group with no categories must be sent with an empty `categories` array. Both are 400, and a failure applies nothing. Together the two checks still require a full snapshot of the catalog.
- **The persisted `sortOrder` is the array index**: each item's position in its array (`index + 1`) is written straight to `sortOrder`, per group for the categories — no client-sent value to sort by first. `sort_order` carries no unique constraint on either table, so the batch rewrite needs no staging pass; the whole thing is one array-form `$transaction`.
- The reorder answers with the listing itself — same rows, same embedded `categories`, same order — so the two reads never drift apart.
- **Deletion**: groups are **hard-deleted** after a plain pre-check — fetch the group (404 when missing), count dependent categories, throw the resource's conflict error when any exist, then delete. This **diverges from the admin default** (lock-then-delete; see `src/apps/admin/AGENTS.md`): no row lock or transaction, because only one operator ever touches this surface, so the pre-check-then-delete race is not a concern. The restricting FK stays the second line of defense — its foreign-key error is translated to that same conflict.
- **Prisma error translation**: `name` is unique in the schema, so **both** creation and the shared update helper translate the unique-constraint error into the resource's conflict `AppException` — renaming a group onto an existing name is rejected the same way a duplicate create is.

---

## Conventions

| Rule | Detail |
|---|---|
| Inactive on create | New groups are created with the flag off; only an explicit activation turns it on |
| Deactivation is flag-only | Deactivating a group leaves its categories untouched |
| Server-assigned `sortOrder` | Creation computes the next value; the client never sends one |
| Hard delete after a pre-check | Fetch the group, prove no categories depend on it, then delete — with the FK error translated to the same conflict |
| Reorder all-or-nothing | The reorder payload must cover every group id exactly once **and**, inside each group, exactly that group's category ids |
| Reorder is for groups and categories only | This endpoint reorders groups and their categories; products are ordered separately, in the products module |
| A category never changes group | `categoryGroupId` is set on create by the categories module and is never rewritten afterwards, here or anywhere else |
| `sortOrder` comes from array position | The client never sends it on the reorder payload; the item's index (`+1`) is what gets persisted |
