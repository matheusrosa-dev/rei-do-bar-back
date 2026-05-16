# CLAUDE.md — prisma/

## Schema Location

`prisma/schema.prisma` is the single source of truth for the database schema. The generated Prisma client is output to `src/shared/database/prisma/generated/` (configured via `generator.output`).

---

## Generator Configuration

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/shared/database/prisma/generated"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}
```

- **`moduleFormat = "cjs"`** — generates CommonJS modules, required for compatibility with NestJS's module resolution
- `DATABASE_URL` is read from `.env` via `prisma.config.ts` (uses `dotenv/config`)

---

## Data Models

### Active Models

| Model | Table | Notes |
|---|---|---|
| `Customer` | `customers` | Authenticated user. Has `name?`, `phone` (unique), `isActive`, addresses, cart, refresh tokens |
| `AnonymousCustomer` | `anonymous_customers` | Pre-login user identified by `deviceId` UUID. Has cart and OTP codes. Deleted on first login |
| `RefreshToken` | `refresh_tokens` | Hashed refresh tokens. One-to-many with `Customer`. Cascade-deleted when customer deleted |
| `OtpCode` | `otp_codes` | Hashed OTP + `expiresAt`. Many per `AnonymousCustomer`. Cascade-deleted |
| `Address` | `addresses` | Customer delivery addresses. Has `isMain` flag. One customer can have many addresses |
| `Cart` | `cart` | Belongs to either `Customer` OR `AnonymousCustomer` (never both). Has `CartItem[]` |
| `CartItem` | `cart_items` | Junction of `Cart` and `Product`. Unique constraint on `[cartId, productId]`. Has `quantity` |
| `Category` | `categories` | Has `name` (unique), `pluralName`, `isActive` |
| `Product` | `products` | Has `price` (Int, cents), `stock`, `sortOrder?` (for best-sellers ordering), `isActive` |
| `Setting` | `settings` | Key-value store. Current key: `DELIVERY_FEE` (value stored as string, in cents) |

### Commented-Out Models (planned, not implemented)

`Deliverer`, `DelivererToken`, `Order`, `OrderItem` are commented out in the schema. The `OrderStatus` enum exists but is unused. Do not implement these until the feature is prioritized.

---

## Schema Conventions

| Convention | Detail |
|---|---|
| All IDs | `String @id @default(uuid())` |
| Column naming | DB columns use `snake_case` via `@map("column_name")` |
| Table naming | `@@map("table_name")` uses `snake_case` plural |
| Timestamps | `createdAt DateTime @default(now()) @map("created_at")`, `updatedAt DateTime @updatedAt @map("updated_at")` |
| Monetary values | Stored as `Int` in cents (e.g. `price: 1500` = R$15,00) |
| Soft delete | `isActive: Boolean` on `Customer` and `Category`/`Product` — never hard-delete customers |

---

## Migrations

```bash
yarn migrate:dev        # prisma migrate dev — create new migration from schema diff
yarn migrate:deploy     # prisma migrate deploy — apply pending migrations in production
yarn migrate:reset      # prisma migrate reset — reset DB and re-apply all migrations (dev only)
yarn prisma:generate    # prisma generate — regenerate client after schema changes
```

Migrations are in `prisma/migrations/`. Each migration has a timestamped folder with `migration.sql`.

**After any schema change**: run `prisma generate` to update the generated client, then update `prismaMock` in `src/shared/testing/mocks.ts` if new model methods are needed.

---

## Seeds

```bash
yarn seed    # runs prisma/seed.ts via tsx
```

`seed.ts` bootstraps a `PrismaClient` instance directly (not via NestJS DI) and calls seed functions in order:

1. `seedSettings` — inserts `DELIVERY_FEE = 200` (R$2,00) if not present
2. `seedCategories` — inserts default categories
3. `seedProducts` — inserts default products

Seed functions are **idempotent** — they check for existing records and only insert missing ones.

---

## `prisma.config.ts` (root level)

Used by the Prisma CLI for migration commands. Reads `DATABASE_URL` from `.env` via `dotenv/config`. The schema path and migrations path are explicitly configured:

```typescript
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
```
