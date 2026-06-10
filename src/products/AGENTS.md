# AGENTS.md — src/products/

## What belongs here

Client-facing product catalog queries — currently the best-sellers listing with optional category/search filtering and cart-aware stock enrichment.

## What does NOT belong here

- Product creation, editing, or deletion → the admin products sub-module.
- Cart operations → the cart module.
- Category management → the categories / admin categories modules.

---

## Key Design: Cart-Aware Listing

The listing fetches products and the current session's cart **in parallel**, reusing the same anonymous/customer duality as the cart domain (anonymous lookup by device id vs. active-customer lookup by id). The cart items are reduced to a per-product quantity map for O(1) lookup while enriching each product with:
- the quantity already in the session's cart (zero when absent), and
- a low-stock indicator (omitted above a threshold, otherwise the actual remaining count).

---

## Filtering

The service derives whether any filter (category or search term) is active. With no filter, the query is constrained to products explicitly flagged as best-sellers; when any filter is present that constraint is dropped and all matching active products are returned. Best-seller ordering is applied by the explicit sort field regardless of the active filter.

---

## DTOs

The query DTO validates the optional filter params. The response DTO (applied at controller class level) exposes catalog fields plus the two computed enrichment fields.

---

## Conventions

| Rule | Detail |
|---|---|
| Parallel I/O | Product and cart lookups run together, not sequentially |
| Reuse the duality | Session resolution mirrors the cart domain's anonymous/customer branching |
| Filter toggles best-seller scope | Best-seller-only constraint applies solely when no filter is active |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
