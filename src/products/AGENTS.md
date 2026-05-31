# AGENTS.md — src/products/

## What belongs here

Product catalog queries for client-facing endpoints. Currently only the best-sellers listing with optional category/search filtering and cart-aware stock enrichment.

## What does NOT belong here

- Product creation/editing (no admin API yet)
- Cart operations → `src/cart/`
- Category management → `src/categories/`

---

## Current Endpoints

`GET /products/best-sellers?category=<name>&searchTerm=<term>`

Both query params are optional and validated via `FindBestSellersDto`. Returns products enriched with:
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

## Filtering

The service computes `hasFilter = !!(category || searchTerm)`. When no filter is active, the query adds `sortOrder: { not: null }` — returning only products explicitly marked as best-sellers. When any filter is present, that constraint is dropped and all active products matching the filter are returned.

| Param | Prisma clause |
|---|---|
| `category` | `{ category: { name: value } }` (relational filter) |
| `searchTerm` | `{ OR: [{ name: { contains, insensitive } }, { description: { contains, insensitive } }] }` |

`sortOrder` is an `Int?` on the `Product` model — the lower the value, the earlier the product appears (`orderBy: { sortOrder: "asc" }`). The `orderBy` is applied regardless of whether `sortOrder: { not: null }` is in the `where`.

---

## DTOs

`FindBestSellersDto` (query params — validated with class-validator):

| Field | Notes |
|---|---|
| `category` | Optional. Filters by `category.name`. |
| `searchTerm` | Optional. Case-insensitive OR search on `name` and `description`. |

`ProductsDto` (applied via `@Serialize(ProductsDto)` on the controller class):

| Field | Notes |
|---|---|
| `id`, `name`, `description`, `price`, `imageUrl` | Direct from DB |
| `quantityInCart` | Computed in service |
| `remainingStock` | `null` or actual stock ≤ 10 |

---

## Error Codes

| Constant | Code | HTTP | When |
|---|---|---|---|
| `products.INVALID_SESSION` | `PRODUCTS_001` | 500 | Session has neither or both `deviceId`/`customerId` — should never happen if guards are configured correctly |
