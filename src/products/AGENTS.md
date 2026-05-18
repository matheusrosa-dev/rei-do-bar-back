# AGENTS.md — src/products/

## What belongs here

Product catalog queries for client-facing endpoints. Currently only the best-sellers listing with optional category filtering and cart-aware stock enrichment.

## What does NOT belong here

- Product creation/editing (no admin API yet)
- Cart operations → `src/cart/`
- Category management → `src/categories/`

---

## Current Endpoints

`GET /products/best-sellers?category=<name>`

Returns products with `sortOrder IS NOT NULL` (all best-sellers) or filtered by `category.name`. Each product is enriched with:
- `quantityInCart` — how many units are in the current session's cart (0 if not in cart)
- `remainingStock` — `null` if stock > 10, otherwise the actual stock count (low-stock indicator)

---

## Key Design: Cart-Aware Product Listing

`ProductsService.findBestSellers` fetches products and the session's cart in **parallel** (`Promise.all`). The cart lookup uses the same anonymous/customer duality as `CartService`:

- `session.deviceId` → `anonymousCustomer.findUnique({ where: { deviceId } })`
- `session.customerId` → `customer.findUnique({ where: { id, isActive: true } })`

Both queries select only `cart.items.{ productId, quantity }`.

```typescript
const [bestSellers, customerOrAnonymous] = await Promise.all([
  this.prisma.product.findMany({ ... }),
  this.findAnonymousOrCustomerWithCart(session),
]);

const quantityInCart = this.calculateQuantityInCart(
  customerOrAnonymous?.cart?.items ?? [],
);
```

`calculateQuantityInCart` returns a `Record<productId, quantity>` map — O(1) lookup per product.

---

## Filtering by Category

When `category` query param is present, the query filters by `category.name` (relational filter). When absent, it filters by `sortOrder: { not: null }` — meaning only products explicitly marked as best-sellers (with a `sortOrder`) are returned.

`sortOrder` is an `Int?` on the `Product` model — the lower the value, the earlier the product appears (`orderBy: { sortOrder: "asc" }`).

---

## DTOs

`ProductsDto` (applied via `@Serialize(ProductsDto)` on the controller class):

| Field | Notes |
|---|---|
| `id`, `name`, `description`, `price`, `imageUrl` | Direct from DB |
| `quantityInCart` | Computed in service |
| `remainingStock` | `null` or actual stock ≤ 10 |
