# AGENTS.md — src/products/

## What belongs here

Client-facing product catalog queries — currently a single listing with optional category/search filtering and cart-aware stock enrichment.

The route and service method are named "best sellers", but that name is **vestigial**: there is no best-seller flag on the product model and no sales-based ranking. The listing returns every active product ordered by its manual sort order. Treat the name as historical, and don't build sales logic on the assumption that it already exists.

## What does NOT belong here

- Product creation, editing, or deletion → the admin products sub-module.
- Cart operations → the cart module.
- Category management → the categories / admin categories modules.

---

## Key Design: Cart-Aware Listing

The listing fetches products and the current session's cart **in parallel**, reusing the same anonymous/customer branching as the cart domain (anonymous lookup by device id vs. customer lookup by id — neither filters on active/soft-deleted). The cart items are reduced to a per-product quantity map for O(1) lookup while enriching each product with:
- the quantity already in the session's cart (zero when absent), and
- `remainingStock`: the actual remaining count **at or below the low-stock threshold of 10**, and `null` above it. The field is always present — `null` means "plenty", not "unknown". The raw stock quantity is queried but never exposed.

One deliberate difference from the cart resolver: this one **does not throw** when the session's owner or cart is missing — it falls back to an empty cart, so a stale device id still gets a browsable catalog. The only failure is a session carrying neither a device id nor a customer id.

---

## Filtering

The query always returns active, non-deleted products. Category and search-term filters are additive and optional — either, both, or neither may be present; a search term matches product name, description, or category name (case-insensitive). Results are always ordered by an explicit sort field, and each product's response includes its compare-at price alongside the current price.

---

## DTOs

The query DTO validates the optional filter params. The response DTO (applied at controller class level) exposes catalog fields plus the two computed enrichment fields.

---

## Conventions

| Rule | Detail |
|---|---|
| Parallel I/O | Product and cart lookups run together, not sequentially |
| Reuse the duality | Session resolution mirrors the cart domain's anonymous/customer branching, but degrades to an empty cart instead of throwing |
| Explicit ordering | Results are always sorted by the explicit sort field, independent of active filters |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
