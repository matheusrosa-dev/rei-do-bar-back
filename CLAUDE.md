# CLAUDE.md — Rei do Bar (Backend)

## Project Overview

REST API for a bar/restaurant delivery app. Built with **NestJS v11** on Node.js, written in **TypeScript**. Handles anonymous browsing, phone-based OTP authentication, product catalog, and cart management. Orders and delivery are modeled in the schema (commented out) but not yet implemented.

---

## Technology Stack

### Core

| Dependency | Usage in this project |
|---|---|
| `@nestjs/common`, `@nestjs/core` | Framework foundation — modules, controllers, providers, guards, interceptors, filters |
| `@nestjs/platform-express` | Express adapter for NestJS HTTP layer |
| `rxjs` | Used internally by interceptors (`map`, `delay` operators on response streams) |
| `reflect-metadata` | Required for decorator metadata (emitDecoratorMetadata) |

### Database

| Dependency | Usage in this project |
|---|---|
| `prisma` (dev) | CLI for migrations (`migrate dev/deploy/reset`) and client generation |
| `@prisma/client` | Generated ORM client — models live in `prisma/schema.prisma`, output at `src/shared/database/prisma/generated/` |
| `@prisma/adapter-pg` | Driver adapter (`PrismaPg`) used instead of the default driver — initialized with `connectionString` in `PrismaService` |

### Auth & Security

| Dependency | Usage in this project |
|---|---|
| `@nestjs/passport` | Integrates Passport.js strategies as NestJS injectable providers |
| `passport-jwt` | JWT extraction and validation strategy (`ExtractJwt.fromAuthHeaderAsBearerToken`) |
| `jsonwebtoken` | Used directly (not via passport) in `AuthService.generateTokens()` to sign access and refresh JWTs |
| `@types/passport-jwt` | Types for the JWT strategy |

### Validation & Transformation

| Dependency | Usage in this project |
|---|---|
| `class-validator` | DTO validation via decorators (`@IsString`, `@IsUUID`, `@Length`, etc.) — applied globally by `ValidationPipe` |
| `class-transformer` | DTO serialization via `plainToInstance` with `excludeExtraneousValues: true` — triggered by the `@Serialize()` decorator |
| `@nestjs/mapped-types` | Utility for extending/omitting DTOs (available but not heavily used currently) |

### Configuration

| Dependency | Usage in this project |
|---|---|
| `@nestjs/config` | Environment config — loaded via `ConfigModule` with `registerAs` namespaces (`api`, `database`, `auth`) and Joi validation schema |
| `joi` | Schema validation for environment variables at startup, defined in `src/shared/config/env-config.ts` |

### Testing

| Dependency | Usage in this project |
|---|---|
| `jest` + `@types/jest` | Test runner; configured in `jest.config.ts` with root at `src/` |
| `@swc/jest` | Fast TypeScript transpilation for tests (replaces `ts-jest`) |
| `@nestjs/testing` | `Test.createTestingModule()` for unit tests with DI container |
| `chance` | Fake data generation in factory classes (`src/shared/testing/factories/`) |
| `supertest` | HTTP integration testing in `test/` (e2e) |

### Tooling

| Dependency | Usage in this project |
|---|---|
| `@biomejs/biome` | Linter + formatter replacing ESLint/Prettier — config in `biome.json` |
| `husky` | Git hooks — runs `prepare` script |
| `tsx` | Used to run `prisma/seed.ts` directly via `yarn seed` |

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
│   ├── main.ts                  # Bootstrap: creates NestJS app, applies global config
│   ├── app.module.ts            # Root module: registers all feature modules + global providers
│   ├── auth/                    # Authentication: OTP flow, JWT issuance, token refresh
│   ├── cart/                    # Cart management (anonymous + authenticated)
│   ├── categories/              # Product categories (read-only for clients)
│   ├── customers/               # Internal customer service (no public controller)
│   ├── me/                      # Authenticated customer self-management
│   ├── products/                # Product catalog (best-sellers listing)
│   └── shared/                  # Cross-cutting concerns: config, DB, guards, interceptors, etc.
│       ├── config/              # Env config loading and interfaces
│       ├── database/            # PrismaService + generated Prisma client
│       ├── decorators/          # @Public(), @CurrentSession()
│       ├── exceptions/          # AppException with typed error codes
│       ├── filters/             # GlobalExceptionFilter
│       ├── guards/              # DeviceIdGuard, AccessTokenGuard, RefreshTokenGuard
│       ├── helpers/             # Pure functions: hashString, generateOtpCode
│       ├── interceptors/        # WrapperDataInterceptor, SerializeInterceptor, DelayInterceptor
│       ├── testing/             # Test factories, mocks (only used in tests)
│       └── types/               # Shared TypeScript interfaces (ICurrentSession)
└── test/                        # E2E tests (supertest)
```

---

## Global Conventions

### File & Directory Naming

- All filenames are **kebab-case**: `auth.service.ts`, `access-token.strategy.ts`
- Test files live in `__tests__/` subdirectories named `<subject>.spec.ts`
- Each feature module directory contains exactly: `<feature>.module.ts`, `<feature>.service.ts`, `<feature>.controller.ts`, `dtos/`, `__tests__/`

### Exports

- **Named exports only** throughout the codebase — no default exports except `jest.config.ts` and `prisma.config.ts`
- `dtos/index.ts` barrel files re-export all DTOs from the directory
- `src/shared/testing/factories/index.ts` re-exports all factory classes

### TypeScript

- `strictNullChecks: true`, `noImplicitAny: false` — strict null checks but implicit any is allowed
- `emitDecoratorMetadata: true`, `experimentalDecorators: true` — required for NestJS DI
- **Non-null assertions (`!`) are used freely** — Biome's `noNonNullAssertion` rule is disabled
- `module: "nodenext"` + `moduleResolution: "nodenext"` — modern module resolution

### Path Aliases

Single alias defined in both `tsconfig.json` and `jest.config.ts`:

```
@shared/* → ./src/shared/*
```

All imports of shared utilities use `@shared/` — never relative `../../../shared/`.

### Environment Variables

Defined in `.env` (copy from `.env.example`). Loaded via `@nestjs/config` with Joi validation at startup. Accessed only through namespaced `ConfigService.get<IType>("namespace")` — never `process.env` directly in application code (exception: `CurrentSession` decorator reads `AUTH_JWT_SECRET` directly from `process.env`).

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

### Language

- **Code** (variable names, function names, comments): English
- **User-facing strings** (error messages, log messages): **Portuguese (pt-BR)**

### Response Shape

All responses are automatically wrapped by `WrapperDataInterceptor`:

```json
{ "data": { ... } }
```

Unless the response object already has a `data` key, in which case it is returned as-is. Errors follow the shape `{ "code": "DOMAIN_NNN", "message": "..." }`.

### Monetary Values

Prices and fees are stored as **integers in cents** (e.g. `price: 1500` = R$15,00) in the database. Division by 100 happens only at the formatting/presentation layer (e.g., in `CartService.formatCart()`).

---

## Global Providers (registered in AppModule)

| Provider | Scope | Effect |
|---|---|---|
| `DeviceIdGuard` | `APP_GUARD` (global) | All non-`@Public()` routes require a valid UUID in the `x-device-id` header |
| `DelayInterceptor` | `APP_INTERCEPTOR` (global) | Adds artificial delay from `API_DELAY` env var; no-ops when value is 0 |

The `WrapperDataInterceptor` and `GlobalExceptionFilter` are applied in `applyGlobalConfig()` (called in `main.ts`), not in `AppModule`.
