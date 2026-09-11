# AGENTS.md — src/apps/store/products/

## What belongs here

Client-facing product queries: a hierarchical catalog view grouped by category groups, and a full-text search endpoint. Both are cart-aware and return enriched stock information.

## What does NOT belong here

- Product creation, editing, or deletion → the admin products sub-module.
- Cart operations → the cart module.
- Category management → the admin categories and category-groups modules.

---

## Key Design: Cart-Aware Enrichment

The endpoint fetches products and the current session's cart **in parallel**, reusing the same anonymous/customer branching as the cart domain (anonymous lookup by device id vs. customer lookup by id — neither filters on active/soft-deleted). Cart items are reduced to a per-product quantity map for O(1) lookup while enriching each product with:
- the quantity already in the session's cart (zero when absent), and
- `remainingStock`: the actual remaining count **at or below the low-stock threshold of 10**, and `null` above it. The field is always present — `null` means "plenty", not "unknown". The raw stock quantity is queried but never exposed.

One deliberate difference from the cart resolver: this endpoint **never throws** — it falls back to an empty cart when the session's owner or cart is missing, so a stale device id still gets a browsable catalog. There is no "invalid session" case left to handle: `@StoreAuth("deviceId")` at the controller guarantees a valid `x-device-id` before any handler runs, so the session always carries an identifier. That guarantee lives in the guard, not in a re-check here — do not add one back.

---

## The Endpoints

### catalog

A nested hierarchical view grouping products by category and category group:
- **Structure**: an array of category groups, each containing an array of categories, each containing an array of products. All are active and non-deleted products only. The categories array begins with two **pseudo-categories** (synthetized, not stored in the database):
  - `id: "Todos"`, `name: "Todos"` — contains all products of the group, ordered by their `sortOrder`. Always present when the group has products. Carries `imageUrl` from the group's `allProductsImageUrl`.
  - `id: "Promoções"`, `name: "Promoções"` — contains only products with a non-null `compareAtPrice`. **Omitted** if the group has no promotions, never appearing as an empty category. Carries `imageUrl` from the group's `promotionsImageUrl`.
- **Pruning**: category groups with no active categories are omitted; categories with no active/non-deleted products are omitted. The pseudo-categories are built **after** that filter, from what survives it, so a group whose real categories are all empty gets no pseudo-categories either and is pruned as before. The result may be empty if no products exist.
- **Ordering**:
  - Groups and real categories: by `sortOrder`, then `id`.
  - Pseudo-categories: always at the start of each group's category array, in the order `Todos`, `Promoções` (if present).
  - **Products within pseudo-categories**: ordered by their `Product.sortOrder` across the *entire group* (not per real category), with `id` as tiebreaker. This is deliberate, and it is why the flattened list is re-sorted instead of merely concatenated: `Product.sortOrder` is **group-scoped**, not category-scoped — `PUT /admin/products/sort-order` writes `index + 1` over the group's whole product list, crossing category boundaries. Concatenating the real categories in order would impose the *category* order on top of it and discard the sequence the admin curated for exactly this "everything in the group" view. A real category shows the same `sortOrder` values, just narrowed to its own products.
- **Response**: each level includes the id and name; products are enriched with cart and stock fields (quantityInCart, remainingStock) and compare-at price.
- **Product duplication**: products appear **in full** in both their real category *and* in the pseudo-categories (not as references or ids). The same product object is serialized multiple times, once per container.
- **No filters**: this endpoint accepts no query parameters; it always returns the complete catalog structure.

### search

A flat full-text search across all active products:
- **Input**: required `searchTerm` query parameter (string, whitespace trimmed, non-empty after trim; returns 422 if missing or empty).
- **Match criteria**: case-insensitive substring match against product `name`, `description`, or the product's category `name` or `pluralName`.
- **Filters**: the same as catalog — `isActive: true`, `deletedAt: null`, category `isActive: true`, category group `isActive: true`.
- **Ordering**: by `sortOrder` ascending, then `id` ascending. `Product.sortOrder` is group-scoped, so matches from different groups interleave — the order is a stable tiebreak, not a relevance ranking.
- **Response**: a flat array of products (no grouping or hierarchy). Each product is enriched with cart and stock fields; no category data is returned, so a match on the category name is not visible in the payload.
- **No pagination**: the whole match set is returned at once.
- **Never throws**: like the catalog endpoint, it degrades to an empty **cart** (every `quantityInCart` is 0) when the session's owner or cart is missing, instead of failing. No matches simply yields an empty array.

---

## DTOs

Response DTOs are applied at the **handler level** (not the class level):
- `catalog` endpoint: serialized with `ProductsDto`, which structures the hierarchical response as an array of category groups, each containing categories and products.
- `search` endpoint: serialized with `Product`, which flattens the result to an array of individual product objects.

**Important DTO detail**: The `Category` class (internal to the products DTO namespace, not exported) carries `imageUrl: string`. Both real categories and pseudo-categories always carry a non-null image URL: real categories have it from the database, and pseudo-categories source it from their parent category group's `allProductsImageUrl` or `promotionsImageUrl` field.

---

## Reserved Sentinel IDs and Names

The catalog endpoint injects two pseudo-categories per group that carry **reserved string identifiers** to distinguish them from real database rows (real categories have UUID ids). Clients must treat these as opaque sentinels and never attempt to create categories with these ids or names:

| ID | Name | Purpose |
|---|---|---|
| `"Todos"` | `"Todos"` | All products of the group, ordered group-wide |
| `"Promoções"` | `"Promoções"` | Products with `compareAtPrice !== null`; omitted if empty |

Do not create a real category named `"Promoções"`: it would be indistinguishable from the pseudo-category in the response.

---

## Conventions

| Rule | Detail |
|---|---|
| Parallel I/O | Group and cart lookups run together, not sequentially; reduces latency for catalog rendering |
| Reuse the duality | Session resolution mirrors the cart domain's anonymous/customer branching, but degrades to an empty cart instead of throwing |
| Explicit ordering at each level | Results are ordered by `sortOrder` then `id` at every level of the structure |
| Pruning empty containers | The catalog omits groups with no categories and categories with no products |
| No error codes | This module throws nothing and owns no namespace in the error registry. The endpoint degrades gracefully instead of failing; the session invariant is enforced by the route's guard |
| Anonymous, not open | `@StoreAuth("deviceId")` at controller class level: the store app credential and a valid `x-device-id` are required, a JWT is not. The endpoint is cart-aware, so it needs a session to enrich against — it just does not need an authenticated one |
| Shared enrichment | The private `enrichProduct` helper adds quantityInCart and remainingStock to product objects; applied to every product in the response |
