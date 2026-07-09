# AGENTS.md — Rei do Bar (Backend)

## Project Overview

REST API for a bar/restaurant delivery app. Built with **NestJS v11** on Node.js, written in **TypeScript**. Handles anonymous browsing, phone-based OTP authentication, product catalog, cart management, and order placement. An admin backoffice manages products, categories, customers, and orders via HTTP Basic Auth.

The architecture is **feature-oriented and layered**: each feature is a NestJS module exposing a controller (HTTP edge) over a service (business logic), with Prisma as the single data-access layer (no repository abstraction). Cross-cutting infrastructure lives under a shared module and is consumed through a path alias.

---

## Technology Stack

### Core

| Dependency | Usage in this project |
|---|---|
| `@nestjs/common`, `@nestjs/core` | Framework foundation — modules, controllers, providers, guards, interceptors, filters |
| `@nestjs/platform-express` | Express adapter for the NestJS HTTP layer |
| `rxjs` | Used internally by interceptors (`map`, `delay` operators on response streams) |
| `reflect-metadata` | Required for decorator metadata (`emitDecoratorMetadata`) |

### Database

| Dependency | Usage in this project |
|---|---|
| `prisma` (dev) | CLI for migrations (`migrate dev/deploy/reset`) and client generation |
| `@prisma/client` | Generated ORM client — models live in `prisma/schema.prisma`, output under the shared database directory |
| `@prisma/adapter-pg` | Driver adapter (`PrismaPg`) used instead of the default driver — initialized with the connection string in `PrismaService` |

### Auth & Security

| Dependency | Usage in this project |
|---|---|
| `@nestjs/passport` | Integrates Passport.js strategies as NestJS injectable providers |
| `passport-jwt` | JWT extraction and validation strategy (`ExtractJwt.fromAuthHeaderAsBearerToken`) |
| `jsonwebtoken` | Used directly (not via passport) to sign access and refresh JWTs |
| `@types/passport-jwt` | Types for the JWT strategy |
| `@nestjs/throttler` | Rate limiting / brute-force protection — named throttlers configured in `AppModule`, applied per route via custom guards (OTP send/login keyed by device-id, `sync-device-id` keyed by IP); admin Basic Auth uses the throttler storage directly for a per-IP failed-attempt lockout; in-memory storage |

### Validation & Transformation

| Dependency | Usage in this project |
|---|---|
| `class-validator` | DTO validation via decorators (`@IsString`, `@IsUUID`, `@Length`, etc.) — applied globally by `ValidationPipe` |
| `class-transformer` | DTO serialization via `plainToInstance` with `excludeExtraneousValues: true` — triggered by the `@Serialize()` decorator |
| `@nestjs/mapped-types` | Utility for extending/omitting DTOs (available but not heavily used) |

### Configuration

| Dependency | Usage in this project |
|---|---|
| `@nestjs/config` | Environment config — loaded via `ConfigModule` with `registerAs` namespaces and Joi validation |
| `joi` | Schema validation for environment variables at startup |

### Testing

| Dependency | Usage in this project |
|---|---|
| `jest` + `@types/jest` | Test runner; root configured at `src/` |
| `@swc/jest` | Fast TypeScript transpilation for tests (replaces `ts-jest`) |
| `@nestjs/testing` | `Test.createTestingModule()` for unit tests with the DI container |
| `chance` | Fake data generation in factory classes |
| `supertest` | HTTP integration testing (e2e) |

### Tooling

| Dependency | Usage in this project |
|---|---|
| `@biomejs/biome` | Linter + formatter replacing ESLint/Prettier — config in `biome.json` |
| `husky` | Git hooks — runs the `prepare` script |
| `tsx` | Runs the seed entrypoint directly |

---

## Folder Structure

```
/
├── prisma/                      # Database schema, migrations, seed scripts
│   ├── schema.prisma            # Single source of truth for DB models
│   ├── seed.ts                  # Seed entrypoint (run with tsx)
│   ├── migrations/              # Prisma migration SQL files
│   └── seeds/                   # Individual seed functions by domain
├── src/
│   ├── main.ts                  # Bootstrap: creates the NestJS app, applies global config
│   ├── app.module.ts            # Root module: registers feature modules + global providers
│   ├── admin/                   # Admin backoffice: products, categories, customers, orders, settings (HTTP Basic Auth)
│   ├── auth/                    # Authentication: OTP flow, JWT issuance, token refresh
│   ├── cart/                    # Cart management (anonymous + authenticated)
│   ├── categories/              # Product categories (read-only for clients)
│   ├── coupons/                 # Coupon redemption rules: availability, discount calc, usage limits (no public controller)
│   ├── customers/               # Internal customer service (no public controller)
│   ├── me/                      # Authenticated customer self-management
│   ├── orders/                  # Order creation, listing, and cancellation (authenticated customers)
│   ├── products/                # Product catalog (best-sellers listing)
│   ├── settings/               # Client-facing read of active runtime settings (delivery fee, alerts, etc.)
│   └── shared/                  # Cross-cutting concerns
│       ├── config/              # Env config loading and interfaces
│       ├── database/            # PrismaService + generated Prisma client
│       ├── decorators/          # Route/param decorators
│       ├── exceptions/          # AppException with typed error codes
│       ├── filters/             # Global exception filter
│       ├── guards/              # Device-id, access-token, refresh-token, basic-auth, throttler guards
│       ├── helpers/             # Pure functions (hashing, OTP generation)
│       ├── interceptors/        # Response wrapping, serialization, artificial delay
│       ├── testing/             # Test factories and mocks (test-only)
│       └── types/               # Shared TypeScript interfaces
└── test/                        # E2E tests (supertest)
```

---

## Global Conventions

### File & Directory Naming

- All filenames are **kebab-case**.
- Each feature module directory contains exactly: a module, a service, a controller, a `dtos/` directory, and a `__tests__/` directory.
- Test files live in `__tests__/` subdirectories named `<subject>.spec.ts`.

### Exports

- **Named exports only** throughout the codebase — no default exports except `jest.config.ts` and `prisma.config.ts`.
- `dtos/index.ts` barrel files re-export all DTOs from the directory.

### TypeScript

- `strictNullChecks: true`, `noImplicitAny: false` — strict null checks, but implicit `any` is allowed.
- `emitDecoratorMetadata: true`, `experimentalDecorators: true` — required for NestJS DI.
- **Non-null assertions (`!`) are used freely** — Biome's `noNonNullAssertion` rule is disabled.
- `module: "nodenext"` + `moduleResolution: "nodenext"`.

### Path Aliases

A single alias is defined in both `tsconfig.json` and `jest.config.ts`:

```
@shared/* → ./src/shared/*
```

All imports of shared utilities use `@shared/` — never relative `../../../shared/`.

### Environment Variables

Defined in `.env` (copy from `.env.example`). Loaded via `@nestjs/config` with Joi validation at startup. Accessed only through namespaced `ConfigService.get<IType>("namespace")` — never `process.env` directly in application code (the only exception is the `@CurrentSession()` decorator, which reads the JWT secret directly because it runs outside the DI container).

| Variable | Description |
|---|---|
| `API_PORT` | HTTP port |
| `API_DELAY` | Artificial response delay in ms (for frontend dev, defaults to 0) |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_OTP_EXPIRATION_MINUTES` | OTP TTL |
| `AUTH_JWT_SECRET` | Access token signing secret |
| `AUTH_JWT_REFRESH_SECRET` | Refresh token signing secret |
| `AUTH_JWT_EXPIRATION_TIME` | Access token TTL (e.g. `900s`) |
| `AUTH_JWT_REFRESH_EXPIRATION_TIME` | Refresh token TTL (e.g. `14d`) |
| `ADMIN_USERNAME` | Admin backoffice username (HTTP Basic Auth) |
| `ADMIN_PASSWORD` | Admin backoffice password (HTTP Basic Auth) |
| `RATE_LIMIT_DEVICE_SYNC_TTL` / `_LIMIT` | Rate limit for `sync-device-id` (per IP); TTL in seconds |
| `RATE_LIMIT_OTP_SEND_TTL` / `_LIMIT` | Short-window rate limit for OTP send (per device-id); TTL in seconds |
| `RATE_LIMIT_OTP_SEND_LONG_TTL` / `_LIMIT` | Long-window rate limit for OTP send (per device-id); TTL in seconds |
| `RATE_LIMIT_OTP_LOGIN_TTL` / `_LIMIT` | Rate limit for OTP login attempts (per device-id); TTL in seconds |
| `RATE_LIMIT_ADMIN_TTL` / `_LIMIT` | Admin Basic Auth failed-attempt lockout (per IP); TTL in seconds |

### Language

- **Code** (variable names, function names, comments): English.
- **User-facing strings** (error messages, log messages): **Portuguese (pt-BR)**.

### Response Shape & Errors

All successful responses are automatically wrapped as `{ "data": ... }`. Errors follow `{ "code": "DOMAIN_NNN", "message": "..." }`. The full response envelope, error contract, and error-code registry are documented in `.claude/references/api-contract.md`.

### Monetary Values

Prices and fees are stored as **integers in cents** (e.g. `price: 1500` = R$15,00). Division by 100 happens only at the presentation layer.

---

## Global Providers (registered in AppModule)

| Provider | Scope | Effect |
|---|---|---|
| Device-id guard | `APP_GUARD` (global) | All non-public routes require a valid UUID in the `x-device-id` header |
| Delay interceptor | `APP_INTERCEPTOR` (global) | Adds the artificial delay from `API_DELAY`; no-ops when the value is 0 |

`ThrottlerModule` is also registered in `AppModule` (via `forRootAsync`, reading the `rateLimit` config namespace), but its guards are **not** global — they are applied per route. The throttler is global in the DI sense (it provides the storage), while rate limiting is opt-in per endpoint through the throttler guards.

The response-wrapping interceptor and the global exception filter are applied in `applyGlobalConfig()` (called from `main.ts`), not in `AppModule`.
