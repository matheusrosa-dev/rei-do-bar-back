# AGENTS.md — src/shared/

## Purpose

Cross-cutting infrastructure used by every feature module. Nothing here is domain-specific. Feature modules import from this directory through the `@shared/` path alias — never via relative paths.

## Subdirectory Roles

| Directory | Responsibility |
|---|---|
| `config/` | Env loading, namespaced config, the validation schema, and typed config interfaces |
| `database/` | The Prisma service and the generated client |
| `decorators/` | Route/param decorators (public marker, current-session extractor, admin-auth composite) |
| `exceptions/` | The single application exception type and its error-code registry |
| `filters/` | The global exception filter |
| `guards/` | Device-id, access-token, refresh-token, basic-auth, and throttler (rate-limiting) guards |
| `helpers/` | Pure utility functions with no class wrappers |
| `interceptors/` | Response wrapping, serialization, and artificial delay |
| `testing/` | Test factories and mocks — imported only from test files |
| `types/` | Shared interfaces and framework type augmentation |

---

## config/

Config is registered globally and split into namespaces loaded with `registerAs`. A Joi schema validates all required environment variables at startup, so invalid env causes a hard crash. Application code consumes config exclusively through typed `ConfigService.get<IType>("namespace")` access — never `process.env` directly.

## database/

The Prisma service extends the generated client and is provided by a global module, so any feature service can inject it directly. There is **no repository abstraction layer** — services talk to Prisma. The Postgres driver adapter is initialized in the service constructor from config.

## helpers/

Small **pure functions** (no classes) built on Node's crypto primitives — e.g. hashing and one-time-code generation. Add new cross-cutting pure utilities here rather than embedding them in feature services.

## types/

Defines the unified current-session interface, whose shape encodes the anonymous/authenticated duality (an anonymous device id **or** an authenticated customer identity, plus the token only on refresh), and augments the framework request type to carry it.

---

## Conventions

| Rule | Detail |
|---|---|
| Import via alias | Always `@shared/...`, never relative paths into shared |
| No domain logic | Keep feature-specific rules out of shared |
| Direct Prisma access | No repository layer; services inject the Prisma service |
| Config only via `ConfigService` | Never read `process.env` in application code |
