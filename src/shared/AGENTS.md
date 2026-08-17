# AGENTS.md — src/shared/

## Purpose

Cross-cutting infrastructure used by every feature module. Feature modules import from this directory through the `@shared/` path alias — never via relative paths.

Nothing here is domain-specific, with one deliberate exception: the product/order money helpers (`helpers/products-totals.ts`). That calculation is a **shared invariant** rather than one module's rule — the cart, the customer order response, the admin order listing and the admin customer detail must all report the same total for the same items, and a copy per module is exactly how they drift apart. It lives here for that reason, and only for that reason; a rule owned by a single module still belongs to that module.

## Subdirectory Roles

| Directory | Responsibility |
|---|---|
| `config/` | Env loading, namespaced config, the validation schema, and typed config interfaces |
| `database/` | The Prisma service and the generated client |
| `decorators/` | Route/param decorators (public marker, current-session, current-delivery-person and current-delivery-person-session extractors, one auth composite per non-customer audience — admin and delivery person —, throttle composites) |
| `events/` | Cross-module event payload classes carried by the event emitter (e.g. order lifecycle events) |
| `exceptions/` | The single application exception type and its error-code registry |
| `filters/` | The global exception filter |
| `guards/` | Device-id, access-token, refresh-token, one standalone guard per non-customer audience (admin Basic Auth, delivery-person opaque access and refresh tokens), and throttler (rate-limiting) guards |
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

Standalone functions (no classes) covering seven concerns: digest hashing and constant-time comparison, **password hashing**, one-time-code generation, **opaque-token generation**, timezone-aware dates (luxon, `America/Sao_Paulo`), **product totals**, and **Prisma error predicates**.

The two hashing concerns are **not interchangeable** and live in separate files. The plain digest is for high-entropy values the server itself generated (one-time codes, refresh tokens, delivery-person session tokens) — fast is the point, and a stolen digest is useless without the original. User-chosen passwords go through the password helper, which wraps a deliberately slow KDF (bcrypt) with a fixed cost factor and its own verification function; never store a password with the digest helper, and never put a KDF in the token path. Bcrypt's comparison is already constant-time, so the timing-safe string comparison is for static credentials only.

The helper is **hash and verify only** — it deliberately does not carry a throwaway hash for callers to burn time against when no real hash exists. Authentication callers therefore short-circuit on a missing hash and answer faster than they do on a wrong password, which is an accepted user-enumeration oracle rather than an oversight (see `src/delivery-persons/auth/AGENTS.md`). If a caller ever needs that closed, add the constant back here rather than inventing a per-module one.

The **opaque-token** helper mints a bearer token the server can hand out and later revoke: 32 crypto-random bytes, base64url-encoded, returned alongside its digest so the caller persists **only the hash**. It mirrors the one-time-code helper's shape (plaintext + hash in one return) for the same reason — returning them together is what makes "store the hash, hand out the plaintext" the path of least resistance. Reach for it whenever a credential must be revocable server-side; reach for a JWT only when it must be validated *without* a lookup, which is the opposite trade.

Two functions in `products-totals.ts` are the single source of truth for order/cart money — every surface that shows a total goes through them, so none can drift:

| Function | Returns | Used by |
|---|---|---|
| `computeProductsTotals(items)` | `productsTotal`, `productsDiscount`, `productsCount`, `productsTotalLessDiscount` | The cart response, the cart's coupon min-order check, and the coupon base at order creation |
| `computeOrderTotals(order)` | `productsTotal`, `productsDiscount`, `total` | Every order read: the customer order list, the admin listing/board, the admin `total` sort, and the admin customer detail |

`computeProductsTotals` takes a flat `{ price, compareAtPrice, quantity }[]` and computes `productsTotal` as the **gross** figure (`compareAtPrice` when the item is on sale, otherwise `price`), `productsDiscount` as the summed on-sale differences, and `productsTotalLessDiscount` as the **net** total — the figure coupons, minimum-order checks, and every `total` must be built from. The on-sale test is `compareAtPrice` set **and** greater than `price`, so bad data can never yield a negative discount. Callers whose items nest the price under a product (cart items) map to the flat shape first; order items already match structurally.

`computeOrderTotals` wraps it with the order-level money, returning `total = productsTotalLessDiscount + deliveryFee - couponDiscount`. Every read of a **persisted** order spreads it over the row (`{ ...order, ...computeOrderTotals(order) }`) rather than re-deriving the formula.

Two **pre-persistence** call sites assemble that same subtraction inline and are meant to: `formatCart` and the order module's minimum-order check both work from a `deliveryFee` read out of settings and a `couponDiscount` computed on the fly, so there is no order row to pass and `computeOrderTotals` would only recompute the item totals they already hold. They still take their base from `productsTotalLessDiscount` — the *base* is what must never diverge, and that part is always the helper's.

The Prisma predicates are the canonical way to branch on a Prisma failure — never match on the raw error code inline:

| Predicate | Prisma code | Typical use |
|---|---|---|
| `isRecordNotFound` | `P2025` | Translate a missing row into a domain not-found exception |
| `isUniqueConstraintViolation` | `P2002` | Translate a duplicate into a domain conflict exception |
| `isForeignKeyConstraintViolation` | `P2003` | Second line of defense behind a service-level pre-check: translate a restricting foreign key into the same domain conflict/not-found the pre-check would have raised, so a closed race never surfaces as a raw 500 |

Add new cross-cutting utilities here rather than embedding them in feature services.

## types/

Defines the unified current-session interface (plus cross-cutting enums such as the push-notification action) and augments the framework request type to carry it.

The customer session is **additive, not exclusive**: the current-session decorator always populates `deviceId` from the `x-device-id` header, and *adds* `customerId`/`phone` on top of it when a valid token is present — an authenticated session carries both. The raw `token` is attached only on the refresh and logout routes, which are the only handlers that need it.

The **delivery-person augmentations are separate from the customer one**, not variants of it. The two audiences never coexist on a request — a delivery-app call carries no `x-device-id` and no customer JWT — so folding them into one optional-everything interface would only make "which fields are actually set here?" unanswerable at the call site.

The same split holds *within* the delivery audience: **each delivery-person guard resolves its own narrow shape onto its own request property**, with a matching extractor — the authenticated identity on one, the refresh session (the row id plus the presented hash the rotation's count guard needs) on another. Neither carries a field the other's readers would have to null-check. Every one of these extractors is correspondingly dumb: the guard already resolved the value, so the decorator just reads the property back and never decodes or throws.

## events/

Event payload classes emitted through the event emitter to decouple side effects from the feature that triggers them. Each event exposes a static `NAME` and a typed `data` payload; producers emit, and listeners in other modules react (e.g. order lifecycle events drive the inventory ledger and push notifications). Keep payloads to the minimal fields consumers need rather than full entities.

## libs/

Thin adapters around external SDKs, each wrapped in its own injectable module/service so feature code depends on a local abstraction instead of the vendor SDK directly. Feature modules import the wrapper module; they never import the SDK.

---

## Conventions

| Rule | Detail |
|---|---|
| Import via alias | Always `@shared/...`, never relative paths into shared |
| No domain logic | Keep feature-specific rules out of shared. The money helpers are the one carve-out (see Purpose) — an invariant several modules must agree on, not one module's rule |
| Direct Prisma access | No repository layer; services inject the Prisma service |
| Config only via `ConfigService` | Never read `process.env` in application code |
| Prisma errors via predicates | Branch on `isRecordNotFound` / `isUniqueConstraintViolation` / `isForeignKeyConstraintViolation` from `helpers/`, never on raw error codes |
| Product money via the helpers | Derive product totals with `computeProductsTotals` and an order's `total` with `computeOrderTotals` — never re-derive either formula in a feature service |
