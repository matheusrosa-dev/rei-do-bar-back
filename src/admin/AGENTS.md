# AGENTS.md — src/admin/

## What belongs here

Admin backoffice operations protected by HTTP Basic Auth:
- Product management (CRUD, stock, soft-delete, activate/deactivate)
- Category management (create, activate/deactivate, delete)

## What does NOT belong here

- Client-facing product listing → `src/products/`
- Client-facing category listing → `src/categories/`
- Order management → `src/orders/`

---

## Authentication

All admin routes use `@AdminAuth()` — a composite decorator that applies `@Public()` (bypasses `DeviceIdGuard`) and `@UseGuards(BasicAuthGuard)`. `BasicAuthGuard` validates HTTP Basic Auth credentials against `ADMIN_USERNAME` and `ADMIN_PASSWORD` from config namespace `"admin"`.

Admin routes are therefore accessible without an `x-device-id` header and do not use JWT.

---

## File Structure

```
admin/
├── admin.module.ts
├── categories/
│   ├── categories.module.ts
│   ├── categories.controller.ts
│   ├── categories.service.ts
│   └── dtos/
│       ├── index.ts
│       ├── create-category.dto.ts
│       ├── delete-category.dto.ts
│       ├── find-all-category.dto.ts
│       └── toggle-status-category.dto.ts
└── products/
    ├── products.module.ts
    ├── products.controller.ts
    ├── products.service.ts
    └── dtos/
        ├── index.ts
        ├── create-product.dto.ts
        ├── delete-product.dto.ts
        ├── find-all-products.dto.ts
        ├── find-by-id.dto.ts
        ├── toggle-status-product.dto.ts
        ├── update-product.dto.ts
        └── update-stock-product.dto.ts
```

---

## Admin Products Endpoints

All routes are under `@Controller("admin/products")`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/products` | Paginated list with filters and sorting |
| `GET` | `/admin/products/:productId` | Fetch single product by ID |
| `POST` | `/admin/products` | Create product (inactive, stock=0 by default) |
| `PUT` | `/admin/products/:productId` | Full product update |
| `PATCH` | `/admin/products/:productId/activate` | Set `isActive: true` |
| `PATCH` | `/admin/products/:productId/deactivate` | Set `isActive: false` |
| `PATCH` | `/admin/products/:productId/increment-stock` | Add stock units |
| `PATCH` | `/admin/products/:productId/decrement-stock` | Remove stock units |
| `DELETE` | `/admin/products/:productId` | Soft-delete (sets `deletedAt`) |

### List Query Params (`FindAllProductsDto`)

| Param | Type | Notes |
|---|---|---|
| `page` | `Int` (min 1) | Defaults to 1 |
| `limit` | `Int` (1–100) | Defaults to 20 |
| `categoryId` | `UUID` | Filter by category |
| `isActive` | `Boolean` | Filter by active state |
| `searchTerm` | `String` | Case-insensitive OR search on name, description, id, category name |
| `sortKey` | `"sortOrder"` \| `"stock"` | Field to sort by |
| `sortDirection` | `"asc"` \| `"desc"` | Sort direction |

Response: `{ items: Product[], meta: { total, page, limit, totalPages } }`

### Key Patterns

- Newly created products start with `isActive: false` and `stock: 0`
- Soft delete sets `deletedAt = new Date()` on the product and removes all its `CartItem` rows atomically in a single `$transaction`
- All queries filter `deletedAt: null` — soft-deleted products are invisible to all endpoints
- Stock decrement is atomic: uses a `WHERE stock >= amount` guard on the Prisma update; if 0 rows are affected, a secondary `findById` distinguishes "product not found" from "insufficient stock"
- Prisma error `P2025` (record not found) is caught and converted to `AppException`; `P2002` (unique constraint) is caught on category create

### Error Codes

| Constant | Code | HTTP | When |
|---|---|---|---|
| `INSUFFICIENT_STOCK` | `ADMIN_PRODUCTS_001` | 400 | Decrement amount exceeds current stock |
| `PRODUCT_NOT_FOUND` | `ADMIN_PRODUCTS_002` | 404 | Product does not exist or is soft-deleted |
| `INVALID_CATEGORY` | `ADMIN_PRODUCTS_003` | 400 | `categoryId` does not reference an existing category |

---

## Admin Categories Endpoints

All routes are under `@Controller("admin/categories")`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/categories` | List categories with product count |
| `POST` | `/admin/categories` | Create category (inactive by default) |
| `PATCH` | `/admin/categories/:categoryId/activate` | Set `isActive: true` |
| `PATCH` | `/admin/categories/:categoryId/deactivate` | Set `isActive: false` |
| `DELETE` | `/admin/categories/:categoryId` | Hard-delete (only if no products linked) |

### Key Patterns

- Newly created categories start with `isActive: false`
- `GET /admin/categories` includes a `productsCount` field per category (active non-deleted products only, via `_count` with a `deletedAt: null` filter)
- The optional `isActive` query param filters categories by status; omitting it returns all categories
- Category deletion is blocked if any product (even inactive or soft-deleted) references it — a `findFirst({ where: { categoryId } })` pre-check is run before the delete
- `updateCategoryOrThrow` is a shared private helper used by both activate and deactivate

### Error Codes

| Constant | Code | HTTP | When |
|---|---|---|---|
| `CATEGORY_NOT_FOUND` | `ADMIN_CATEGORIES_001` | 404 | Category does not exist |
| `CATEGORY_HAS_PRODUCTS` | `ADMIN_CATEGORIES_002` | 409 | Attempted delete when products still reference this category |
| `CATEGORY_ALREADY_EXISTS` | `ADMIN_CATEGORIES_003` | 409 | Name unique constraint violated on create |
