# AGENTS.md — src/shared/

## Purpose

Cross-cutting infrastructure used by all feature modules. Nothing here is domain-specific. Feature modules import from `@shared/` using the path alias.

## Subdirectories

| Directory | Contents |
|---|---|
| `config/` | Env loading, config namespaces, validation schema, typed interfaces |
| `database/` | `PrismaService` + generated Prisma client |
| `decorators/` | `@Public()`, `@CurrentSession()` |
| `exceptions/` | `AppException` with domain-grouped error codes |
| `filters/` | `GlobalExceptionFilter` |
| `guards/` | `DeviceIdGuard`, `AccessTokenGuard`, `RefreshTokenGuard` |
| `helpers/` | Pure utility functions: `hashString`, `generateOtpCode` |
| `interceptors/` | `WrapperDataInterceptor`, `SerializeInterceptor`, `DelayInterceptor` |
| `settings/` | `SettingsService` — reads `DELIVERY_FEE` from DB with a 5-min in-memory cache; consumed by `CartService` and `OrdersService` |
| `testing/` | Test factories and mock objects — **only imported from `*.spec.ts` files** |
| `types/` | `ICurrentSession` interface + Express `Request` augmentation |

---

## config/

### How Config Is Loaded

1. `ConfigModule` (wraps `@nestjs/config`) is registered globally in `AppModule`
2. Three namespaced configs are loaded via `registerAs`: `"api"`, `"database"`, `"auth"`
3. A Joi schema validates all required env vars at startup — invalid env causes a hard crash
4. Configs are consumed via `configService.get<IType>("namespace")!`

### Interfaces

`env-config.interface.ts` exports `IApiConfig`, `IDatabaseConfig`, `IAuthConfig`. Always use these interfaces for typed config access.

---

## database/

`PrismaService` extends `PrismaClient` and is provided by `DatabaseModule` which is `@Global()`. Every feature service injects `PrismaService` directly — there is no repository abstraction layer.

The generated client is at `src/shared/database/prisma/generated/` (output path set in `prisma/schema.prisma`). Import types and the client from this path:

```typescript
import { PrismaClient, Customer, Cart } from "@shared/database/prisma/generated/client";
```

`PrismaPg` adapter is initialized in the `PrismaService` constructor with the `DATABASE_URL` from config.

---

## helpers/

Two pure functions, no class wrappers:

```typescript
// string.ts
hashString(value: string): string  // SHA-256 hex digest

// otp-code.ts
generateOtpCode(): { code: string; hashedCode: string }  // 6-char alphanumeric
```

Both use Node.js built-in `crypto` module. `generateOtpCode` uses `crypto.getRandomValues` (Web Crypto API, available globally in Node 19+).

---

## types/

`ICurrentSession` is the unified session object produced by `@CurrentSession()`:

```typescript
interface ICurrentSession {
  deviceId?: string;    // present when anonymous
  customerId?: string;  // present when authenticated
  phone?: string;       // present when authenticated
  token?: string;       // present only on /auth/refresh
}
```

The file also augments Express's `Request` interface to add `user?: ICurrentSession`.
