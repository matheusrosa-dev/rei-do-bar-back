# AGENTS.md — Rei do Bar (Backend)

## Project Overview

REST API for a bar/restaurant delivery app. Built with **NestJS v11** on Node.js, written in **TypeScript**. Handles anonymous browsing, phone-based OTP authentication, product catalog, cart management, and order placement — the whole customer surface sits behind a fixed app-wide HTTP Basic credential sent in the `x-store-authorization` header, on top of whichever session credential each route requires. An admin backoffice manages products, categories, customers, and orders via HTTP Basic Auth, and a delivery-person surface serves the delivery app behind its own app-wide HTTP Basic credential (in the `x-delivery-person-authorization` header) plus its own login: the entregador authenticates with a CPF and a password the admin assigns, and receives short-lived **opaque tokens** the admin can revoke at any time. From that app the entregador reads their delivery queue, confirms each delivery — the one order transition the entregador can perform, alongside the backoffice — and sees how many deliveries they have closed in the recent window.

The architecture is **feature-oriented and layered**: each feature is a NestJS module exposing a controller (HTTP edge) over a service (business logic), with Prisma as the single data-access layer (no repository abstraction). Cross-cutting infrastructure lives under a shared module and is consumed through a path alias.

Feature modules are grouped by **consumer audience** under `src/apps/`: `store/` (the customer app), `admin/` (the backoffice), and `delivery-persons/` (the delivery app). The grouping is organizational, not a new layer — an app directory adds no abstraction of its own, but each one owns a **container module** at its root (`StoreModule`, `AdminModule`, `DeliveryPersonsModule`) that registers its sub-modules, and only those three are imported by `AppModule`. A new feature belongs to exactly one app directory; when two audiences need the same rules, the owning module exports its service and the other imports it (as `store/coupons/` does) instead of the logic being duplicated or hoisted out of `apps/`.

---

## Rule Zero — Read the AGENTS.md files

Before accessing, creating, or modifying any file inside a directory, you **must** read the `AGENTS.md` file in that directory, if one exists. Also read the root `AGENTS.md` before any task.

The `AGENTS.md` files are the source of truth for the conventions in their respective scopes and take precedence over any inferred pattern. Never assume a convention — always consult the corresponding `AGENTS.md` first.

For the stable API contract (response envelope, error response shape, the error-code registry, and the pagination shape), consult `.claude/references/api-contract.md`.

---

## Hard Constraints

- **NEVER alter the directory structure or create new scaffolding folders/files without first asking the user and receiving explicit confirmation.**
- **NEVER install, remove, or update dependencies without first asking the user.** Present the package and the justification, then wait for approval.
- **NEVER run destructive database commands** (`migrate reset`, `db push`, `db drop`) without explicit user confirmation.
- **NEVER stage or unstage files (`git add`, `git reset`, etc.) on your own initiative.**
- **NEVER run `git commit`.**
- **NEVER run `git push`.**
- Do not over-engineer. Implement exactly what was requested — nothing more.
- Do not add comments, docstrings, or type annotations to code you did not change.
- Do not nest ternaries.
- Comment only when genuinely necessary. If a name doesn't explain itself, rename it before adding a comment.
- Never use `process.env` directly in application code — always access config through `ConfigService.get<IType>("namespace")`.
- Never throw a raw `Error` or the framework `HttpException` — always use `AppException` with a registered error code.
- All user-facing strings (error messages, logs) must be in **Portuguese (pt-BR)**.
- **NEVER create, modify, or delete test files** (`__tests__/`, `*.spec.ts`, `test/`, factories/mocks in `shared/testing/`) unless the user explicitly asks for it in that task. Finishing an implementation is not a reason to write or update tests.

---

## Post-Implementation — Workflow

After finishing **all** edits in a task:

1. Run `npm run lint` and `npm run typecheck` in the terminal. Fix every reported lint and type error before proceeding.
2. Launch an **independent subagent** with the `/review-changes` command as the prompt (`.claude/commands/review-changes.md`), passing the list of every file changed and a short description of what was implemented. Wait for the full report.
3. Fix **all Critical and Warning** issues from the report, then re-run `npm run lint` and `npm run typecheck` to confirm no new issues were introduced.
4. Run the `/review-agents-docs` command (`.claude/commands/review-agents-docs.md`) with the same list of changed files to audit the affected documentation.

> **Review severity levels.** **Critical** = broken contract, bug, security risk, or a violation of a structural project convention. **Warning** = style inconsistency, a pattern applied incompletely, or a decision that will accrue debt. **Suggestion** = optional improvement with no immediate impact.

---

## Technology Stack

### Core

| Dependency | Usage in this project |
|---|---|
| `@nestjs/common`, `@nestjs/core` | Framework foundation — modules, controllers, providers, guards, interceptors, filters |
| `@nestjs/platform-express` | Express adapter for the NestJS HTTP layer |
| `rxjs` | Used internally by interceptors (`map`, `delay`, `tap`, `catchError` operators on response streams) |
| `reflect-metadata` | Required for decorator metadata (`emitDecoratorMetadata`) |
| `@nestjs/event-emitter` | In-process event bus — registered in `AppModule`; order lifecycle events live in `shared/events/`, and the admin inventory/notifications listeners react to them |

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
| `bcrypt` | Password hashing/verification — wrapped by the password helper under `shared/helpers/`; backs the per-delivery-person login credential (only the hash is stored) |
| `@types/passport-jwt` | Types for the JWT strategy |
| `@types/bcrypt` | Types for the password hashing library |
| `@nestjs/throttler` | Rate limiting / brute-force protection — named throttlers configured in `AppModule`, applied per route via custom guards (OTP send/login keyed by device-id, `sync-device-id` keyed by IP); the admin Basic Auth guard and the delivery-person login service use the throttler storage directly for a per-IP failed-attempt lockout, one bucket per audience; in-memory storage |

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

### Integrations & Utilities

| Dependency | Usage in this project |
|---|---|
| `expo-server-sdk` | Push notification delivery — wrapped by the Expo service under `shared/libs/` |
| `luxon` | Timezone-aware date helpers (`America/Sao_Paulo`) in `shared/helpers/date.ts` |

### Testing

| Dependency | Usage in this project |
|---|---|
| `jest` + `@types/jest` | Test runner — `rootDir: src`, `clearMocks: true`, and the `@shared` `moduleNameMapper` (see Path Aliases) |
| `@swc/jest` + `@swc/core` | Fast TypeScript transpilation for tests — configured in `.swcrc`, which rewrites `@shared/` imports at transpile time |
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
│   ├── apps/                    # Feature modules, grouped by consumer audience (one directory per app)
│   │   ├── admin/               # Admin backoffice (HTTP Basic Auth) — container module + sub-modules
│   │   │   ├── categories/       # Category CRUD, ordering, status
│   │   │   ├── coupons/          # Coupon CRUD, listing, status
│   │   │   ├── customers/        # Customer listing, status, hard deletion
│   │   │   ├── dashboard/        # Read-only aggregations for the backoffice panel
│   │   │   ├── delivery-persons/ # Delivery-person CRUD, password assignment, access revocation
│   │   │   ├── inventory/        # Stock movements + order lifecycle listener
│   │   │   ├── notifications/    # Push dispatch + broadcast history + order lifecycle listener
│   │   │   ├── orders/           # Order listing, status transitions, delivery-person assignment
│   │   │   ├── products/         # Product CRUD, ordering, status
│   │   │   └── settings/         # Runtime settings read/update/toggle
│   │   ├── delivery-persons/    # Delivery app surface (opaque bearer tokens) — container module + sub-modules
│   │   │   ├── auth/            # CPF + password login, token refresh
│   │   │   └── orders/          # Orders out for delivery, delivery confirmation, shift delivery count
│   │   └── store/               # Customer-facing app — container module + sub-modules
│   │       ├── auth/            # Authentication: OTP flow, JWT issuance, token refresh
│   │       ├── cart/            # Cart management (anonymous + authenticated)
│   │       ├── categories/      # Product categories (read-only for clients)
│   │       ├── coupons/         # Coupon redemption rules (availability, discount calc, usage limits) + coupon listing for authenticated customers
│   │       ├── customers/       # Internal customer service (no public controller)
│   │       ├── me/              # Authenticated customer self-management
│   │       ├── notifications/   # Push token registration and per-device revocation for authenticated customers
│   │       ├── orders/          # Order creation, listing, and cancellation (authenticated customers)
│   │       ├── products/        # Product catalog (best-sellers listing)
│   │       └── settings/        # Client-facing read of active runtime settings (delivery fee, alerts, etc.)
│   └── shared/                  # Cross-cutting concerns
│       ├── config/              # Env config loading and interfaces
│       ├── database/            # PrismaService + generated Prisma client
│       ├── decorators/          # Route/param decorators (current-session, current-delivery-person, current-delivery-person-session, store-auth, admin-auth, delivery-person-auth, throttle)
│       ├── events/              # Order lifecycle event payloads (event-emitter)
│       ├── exceptions/          # AppException with typed error codes
│       ├── filters/             # Global exception filter
│       ├── guards/              # One directory per audience — store/ (basic-auth, device-id, access/refresh token, OTP throttler), admin/ (basic-auth), delivery-persons/ (basic-auth, access/refresh token, DB session) — plus the throttler base and IP tracker at the root; none registered globally
│       ├── helpers/             # Digest hashing, password hashing (bcrypt), OTP generation, opaque tokens, timezone dates, Prisma error predicates
│       ├── interceptors/        # Response wrapping, serialization, artificial delay, HTTP logging
│       ├── libs/                # Third-party wrappers (Expo push notifications)
│       ├── testing/             # Test factories and mocks (test-only)
│       └── types/               # Shared TypeScript interfaces and enum re-exports
└── test/                        # E2E tests (supertest)
```

---

## Global Conventions

### File & Directory Naming

- All filenames are **kebab-case**.
- Every feature module lives under `src/apps/<app>/<feature>/`, one directory per feature, never at the `src/` root. Nesting stops there: features are not further grouped into sub-domains inside an app.
- A feature module directory typically contains: a module, a service, a controller, a `dtos/` directory, and a `__tests__/` directory. Three deviations are expected:
  - **Internal modules** (`store/customers/`) have no controller and no `dtos/` — they are consumed by other services, not over HTTP. `store/coupons/` is a hybrid: it exports its service to other modules **and** owns a client-facing controller.
  - **Container modules** (`store/`, `admin/`, `delivery-persons/`) sit at an app root and hold only a module file plus their sub-module directories — no service, controller, or `dtos/` of their own.
  - Modules add supporting files when the domain needs them: `strategies/` (store auth), `helpers.ts` (several admin sub-modules), `validators/` (admin coupons), `*.listener.ts` (admin inventory/notifications), and a second controller (`store/me/address.controller.ts`).
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

A single alias is declared in three places, one per resolver — `tsconfig.json` (the compiler), `.swcrc` (`jsc.paths`, which rewrites `@shared/` **import statements** at transpile time under `@swc/jest`), and `jest.config.ts` (`moduleNameMapper`, which is Jest's own module resolver):

```
@shared/* → ./src/shared/*
```

The Jest mapper is not redundant with `.swcrc`: SWC only rewrites imports, so an alias passed as a *string* — most importantly `jest.mock("@shared/…")` — is resolved by Jest itself and fails without it. Keep all three in sync; adding the alias to one and not the others silently breaks a subset of tests rather than erroring outright.

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
| `AUTH_JWT_REFRESH_EXPIRATION_TIME` | Refresh token TTL (e.g. `30d`) |
| `AUTH_DELIVERY_PERSON_TOKEN_EXPIRATION_MINUTES` | Delivery-person access token TTL in minutes (5) |
| `AUTH_DELIVERY_PERSON_REFRESH_EXPIRATION_MINUTES` | Delivery-person refresh token TTL in minutes (240), sliding on every refresh |
| `STORE_USERNAME` | Store app username (HTTP Basic Auth, required on every store route) |
| `STORE_PASSWORD` | Store app password (HTTP Basic Auth) |
| `ADMIN_USERNAME` | Admin backoffice username (HTTP Basic Auth) |
| `ADMIN_PASSWORD` | Admin backoffice password (HTTP Basic Auth) |
| `DELIVERY_PERSON_USERNAME` | Delivery app username (HTTP Basic Auth, required on every delivery-person route) |
| `DELIVERY_PERSON_PASSWORD` | Delivery app password (HTTP Basic Auth) |
| `EXPO_ACCESS_TOKEN` | Expo access token for push notification delivery (required — startup fails without it) |
| `RATE_LIMIT_DEVICE_SYNC_TTL` / `_LIMIT` | Rate limit for `sync-device-id` (per IP); TTL in seconds |
| `RATE_LIMIT_OTP_SEND_TTL` / `_LIMIT` | Short-window rate limit for OTP send (per device-id); TTL in seconds |
| `RATE_LIMIT_OTP_SEND_LONG_TTL` / `_LIMIT` | Long-window rate limit for OTP send (per device-id); TTL in seconds |
| `RATE_LIMIT_OTP_LOGIN_TTL` / `_LIMIT` | Rate limit for OTP login attempts (per device-id); TTL in seconds |
| `RATE_LIMIT_ADMIN_TTL` / `_LIMIT` | Admin Basic Auth failed-attempt lockout (per IP); TTL in seconds |
| `RATE_LIMIT_DELIVERY_PERSON_TTL` / `_LIMIT` | Delivery-person login failed-attempt lockout (per IP, counted apart from the admin one); TTL in seconds |

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
| Delay interceptor | `APP_INTERCEPTOR` (global) | Adds the artificial delay from `API_DELAY`; no-ops when the value is 0 |

**No guard is registered globally.** Authentication is opt-in per route: each audience has a composite decorator (`StoreAuth` for the customer app, `AdminAuth`, `DeliveryPersonAuth`) applied on the controller or handler, and a route without one is genuinely unauthenticated. The store and delivery composites are **leveled**, and the lowest level of each (`basic`) is that app's app-wide Basic credential — `x-store-authorization` for the customer app, `x-delivery-person-authorization` for the delivery app. Both surfaces have session-less routes (store categories and settings, delivery login), but neither has a credential-less one. See `src/shared/guards/AGENTS.md`.

`ThrottlerModule` is also registered in `AppModule` (via `forRootAsync`, reading the `rateLimit` config namespace), but its guards are **not** global — they are applied per route. The throttler is global in the DI sense (it provides the storage), while rate limiting is opt-in per endpoint through the throttler guards.

`EventEmitterModule.forRoot()` is registered in `AppModule` as well — it backs the order lifecycle events in `shared/events/` that the admin listeners consume.

`applyGlobalConfig()` (called from `main.ts`, not `AppModule`) applies the rest of the global pipeline:

- the **response-wrapping interceptor** (`{ "data": ... }` envelope) and the **logging interceptor** (`METHOD path status ms`);
- the **global exception filter**;
- the global **`ValidationPipe`** with `transform: true`, `whitelist: true`, and `errorHttpStatusCode: 422` — DTO validation failures return **422**, not 400;
- CORS.
