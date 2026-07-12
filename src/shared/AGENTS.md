# AGENTS.md — src/shared/

## Purpose

Cross-cutting infrastructure used by every feature module. Nothing here is domain-specific. Feature modules import from this directory through the `@shared/` path alias — never via relative paths.

## Subdirectory Roles

| Directory | Responsibility |
|---|---|
| `config/` | Env loading, namespaced config, the validation schema, and typed config interfaces |
| `database/` | The Prisma service and the generated client |
| `decorators/` | Route/param decorators (public marker, current-session extractor, admin-auth composite, throttle composites) |
| `events/` | Cross-module event payload classes carried by the event emitter (e.g. order lifecycle events) |
| `exceptions/` | The single application exception type and its error-code registry |
| `filters/` | The global exception filter |
| `guards/` | Device-id, access-token, refresh-token, basic-auth, and throttler (rate-limiting) guards |
| `helpers/` | Standalone utility functions with no class wrappers |
| `interceptors/` | Response wrapping, serialization, artificial delay, and HTTP request logging |
| `libs/` | Thin wrappers over third-party SDKs, exposed as injectable modules/services (e.g. the Expo push-notification transport) |
| `testing/` | Test factories and mocks — imported only from test files |
| `types/` | Shared interfaces, framework type augmentation, and cross-cutting enums |

---

## config/

Config is registered globally and split into namespaces loaded with `registerAs`. A Joi schema validates all required environment variables at startup, so invalid env causes a hard crash. Application code consumes config exclusively through typed `ConfigService.get<IType>("namespace")` access — never `process.env` directly.

## database/

The Prisma service extends the generated client and is provided by a global module, so any feature service can inject it directly. There is **no repository abstraction layer** — services talk to Prisma. The Postgres driver adapter is initialized in the service constructor from config.

## helpers/

Standalone functions (no classes) covering four concerns: hashing and constant-time comparison, one-time-code generation, timezone-aware dates (luxon, `America/Sao_Paulo`), and **Prisma error predicates**. The last one is the canonical way to branch on a Prisma failure — never match on the raw error code inline:

| Predicate | Prisma code | Typical use |
|---|---|---|
| `isRecordNotFound` | `P2025` | Translate a missing row into a domain not-found exception |
| `isUniqueConstraintViolation` | `P2002` | Translate a duplicate into a domain conflict exception |

Add new cross-cutting utilities here rather than embedding them in feature services.

## types/

Defines the unified current-session interface (plus cross-cutting enums such as the push-notification action) and augments the framework request type to carry it.

The session is **additive, not exclusive**: the current-session decorator always populates `deviceId` from the `x-device-id` header, and *adds* `customerId`/`phone` on top of it when a valid token is present — an authenticated session carries both. The raw `token` is attached only on the refresh and logout routes, which are the only handlers that need it.

## events/

Event payload classes emitted through the event emitter to decouple side effects from the feature that triggers them. Each event exposes a static `NAME` and a typed `data` payload; producers emit, and listeners in other modules react (e.g. order lifecycle events drive the inventory ledger and push notifications). Keep payloads to the minimal fields consumers need rather than full entities.

## libs/

Thin adapters around external SDKs, each wrapped in its own injectable module/service so feature code depends on a local abstraction instead of the vendor SDK directly. Feature modules import the wrapper module; they never import the SDK.

---

## Conventions

| Rule | Detail |
|---|---|
| Import via alias | Always `@shared/...`, never relative paths into shared |
| No domain logic | Keep feature-specific rules out of shared |
| Direct Prisma access | No repository layer; services inject the Prisma service |
| Config only via `ConfigService` | Never read `process.env` in application code |
| Prisma errors via predicates | Branch on `isRecordNotFound` / `isUniqueConstraintViolation` from `helpers/`, never on raw error codes |
