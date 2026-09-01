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

Standard NestJS v11 stack (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `rxjs`, `reflect-metadata`), Prisma (`prisma`, `@prisma/client`), Passport (`@nestjs/passport`, `passport-jwt`, `@types/passport-jwt`), `bcrypt` + `@types/bcrypt`, `@nestjs/throttler`, `class-validator`, `class-transformer`, `@nestjs/mapped-types`, `@nestjs/config` + `joi`, `expo-server-sdk`, `luxon`, `@nestjs/event-emitter`, and the test stack (`jest`, `@swc/jest` + `@swc/core`, `@nestjs/testing`, `chance`, `supertest`). Tooling: `@biomejs/biome` (lint + format), `husky`, `tsx` (seed entrypoint).

Deviations from the plain default worth knowing:

| Dependency | Decision |
|---|---|
| `@prisma/adapter-pg` | Driver adapter (`PrismaPg`) used instead of Prisma's default driver — initialized with the connection string in `PrismaService` |
| `jsonwebtoken` | Signs/verifies access and refresh JWTs directly, **not** through Passport — `passport-jwt` only extracts the bearer token for the access/refresh guards |
| `@nestjs/throttler` | Named throttlers in `AppModule`; **not** applied globally — each guard is opt-in per route, and the admin/delivery-person Basic Auth guards use the throttler storage directly for a per-IP lockout, one bucket per audience |
| Path alias (`@shared/*`) | Declared in three places that must stay in sync — `tsconfig.json`, `.swcrc` (`jsc.paths`, rewrites import statements), and `jest.config.ts` (`moduleNameMapper`, needed because SWC does not resolve a string passed to `jest.mock("@shared/…")`) |

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
│   │   ├── admin/               # Admin backoffice (HTTP Basic Auth) — container + sub-modules, one AGENTS.md each
│   │   │   ├── categories/
│   │   │   ├── coupons/
│   │   │   ├── customers/
│   │   │   ├── dashboard/
│   │   │   ├── delivery-persons/
│   │   │   ├── inventory/
│   │   │   ├── notifications/
│   │   │   ├── orders/
│   │   │   ├── products/
│   │   │   └── settings/
│   │   ├── delivery-persons/    # Delivery app surface (opaque bearer tokens) — container + sub-modules
│   │   │   ├── auth/
│   │   │   └── orders/
│   │   └── store/               # Customer-facing app — container + sub-modules
│   │       ├── auth/
│   │       ├── cart/
│   │       ├── categories/
│   │       ├── coupons/
│   │       ├── customers/
│   │       ├── me/
│   │       ├── notifications/
│   │       ├── orders/
│   │       ├── products/
│   │       └── settings/
│   └── shared/                  # Cross-cutting concerns
│       ├── config/              # Env config loading and interfaces
│       ├── database/            # PrismaService + generated Prisma client
│       ├── decorators/          # Route/param decorators (current-session, current-delivery-person, current-delivery-person-session, store-auth, admin-auth, delivery-person-auth, throttle)
│       ├── events/              # Order lifecycle event payloads (event-emitter)
│       ├── exceptions/          # AppException with typed error codes
│       ├── filters/             # Global exception filter
│       ├── guards/              # One directory per audience — store/, admin/, delivery-persons/ — plus the throttler base and IP tracker at the root; none registered globally
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

### Environment Variables

Defined in [.env.example](.env.example) (copy to `.env`); loaded via `@nestjs/config` with Joi validation at startup. Accessed only through namespaced `ConfigService.get<IType>("namespace")` — never `process.env` directly in application code (the only exception is `@CurrentSession()`, which reads the JWT secret directly because it runs outside the DI container). Names are largely self-describing; the ones that carry semantics `.env.example` doesn't state:

| Variable | Description |
|---|---|
| `API_DELAY` | Artificial response delay in ms (frontend dev aid, defaults to 0) |
| `RATE_LIMIT_OTP_SEND_*` vs `RATE_LIMIT_OTP_SEND_LONG_*` | Two separate windows (short burst + long window) on the same OTP-send route |
| `RATE_LIMIT_ADMIN_*` vs `RATE_LIMIT_DELIVERY_PERSON_*` | Two separate per-IP lockout buckets — an admin lockout never blocks the delivery-person login and vice versa |

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
