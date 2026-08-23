# AGENTS.md — src/shared/guards/

## Guard Chain

**No guard is global.** Every route states its own protection through its audience's composite decorator, and a route with no decorator is genuinely unauthenticated — with two audience-wide exceptions: the store **and** the delivery app each have a floor (their `basic` level, an app credential no route opts out of), so a decorator-less controller on either surface is a hole rather than a decision (see the level tables below). Only the admin surface has a single level and no floor to forget. There is no public marker and no reflector lookup anywhere in this directory — a guard that runs, runs unconditionally.

```
Store request (customer app) — every level starts at the app credential
  └── StoreAuth("basic") → store basic-auth guard
        └── validate x-store-authorization: Basic <base64> against the store config

  └── StoreAuth("deviceId") → store basic-auth guard
        └── device-id guard
              └── require a valid UUID in the x-device-id header

  └── StoreAuth("accessToken") → store basic-auth guard
        └── device-id guard
              └── access-token guard
                    └── validate the bearer JWT (access strategy)

  └── StoreAuth("refreshToken") → store basic-auth guard
        └── device-id guard
              └── refresh-token guard
                    └── validate the bearer JWT (refresh strategy/secret)

  └── no decorator → nothing at all; no store route is left this way

Rate-limited routes (per route, stacked on top of the above)
  └── throttler guard (OTP routes by device-id, device-id sync by IP)
        └── over the limit → throw 429 (AUTH_007)

Admin backoffice request (HTTP Basic Auth)
  └── AdminAuth() → admin basic-auth guard (per controller)
        ├── validate the credential pair against the admin config namespace
        └── on failure, count the attempt per IP in the admin bucket;
            over the limit → throw 429 (AUTH_007)

Delivery-person app request — every level starts at the app credential
  └── DeliveryPersonAuth("basic") → delivery-person basic-auth guard
        └── validate x-delivery-person-authorization: Basic <base64>
            against the deliveryPerson config (the login route)

  └── DeliveryPersonAuth("accessToken") → delivery-person basic-auth guard
        └── delivery-person access-token guard (per controller)
              ├── resolve the session row by the sha256 hash of the bearer token
              ├── reject a missing/unknown token, an expired one,
              │   or an inactive delivery person
              │   → throw 401 (DELIVERY_PERSONS_AUTH_003)
              └── place the delivery person's id on the request

  └── DeliveryPersonAuth("refreshToken") → delivery-person basic-auth guard
        └── delivery-person refresh-token guard (the refresh route only)
              ├── resolve the session row by the sha256 hash of the bearer token
              ├── reject a missing/unknown token, an expired one,
              │   or an inactive delivery person
              │   → throw 401 (DELIVERY_PERSONS_AUTH_002)
              └── place the session id and the presented hash on the request
```

The admin and delivery-person surfaces send **no `x-device-id`** — their composites simply never apply the device-id guard, rather than bypassing it. They do each carry an **app credential** of their own: admin on `Authorization: Basic`, delivery on `x-delivery-person-authorization: Basic`. Two of the three audiences therefore have a floor — store and delivery — and only the admin's single credential doubles as both app and operator identity.

The Passport **refresh-token guard** is applied on the two **customer** routes that present a refresh token: token refresh and logout. It is a customer-flow guard, not a general one — it validates a JWT signature, which an opaque token has none of. The delivery app's refresh route is covered by its own database-backed guard instead (see below).

---

## Directory Layout

Guards are split into **one directory per audience**, mirroring `src/apps/`:

```
guards/
├── store/                    # customer app: store basic-auth, device-id, access-token,
│                             # refresh-token, otp-throttler
├── admin/                    # backoffice: admin basic-auth
├── delivery-persons/         # delivery app: delivery-person basic-auth, access-token,
│                             # refresh-token
├── throttler.guard.ts        # shared rate-limiting base
└── ip-throttler.guard.ts     # shared IP tracker
```

Each audience directory owns its own `__tests__/`. A guard goes into the directory of the audience whose **credential or header** it reads — never the one that happens to use it first. The device-id guard sits under `store/` because the header is the customer app's; the admin and delivery surfaces never send it.

The rate-limiting guards split on the same rule, by **what they track**. `OtpThrottlerGuard` lives under `store/` because its tracker keys on `x-device-id` — the customer app's header, which no other audience sends, so the guard is unusable outside the store surface however its callers change.

`BaseThrottlerGuard` and `IpThrottlerGuard` **stay at the root**: the base only translates a limit breach into `AUTH_007`, and the IP tracker is the library default. Neither reads an audience header, and both are reusable as-is by an admin or delivery rate limit. Their being called only from store routes today is a fact about today's routes, not about the guards.

Filenames keep the audience prefix they already carried (`store-basic-auth.guard.ts`, `delivery-person-access-token.guard.ts`) even though the directory now repeats it — the class names are the prefixed ones, and file and class stay in step. Do not strip the prefix on a move.

## Guard Roles

- **Device-id guard**: reads the `x-device-id` header and validates it as a UUID. It only gates access and does not populate the request user. It has **no dependencies and no metadata lookup** — it runs on exactly the routes whose `StoreAuth` level includes it, and on no others.
- **Store basic-auth guard**: the customer app's **application credential** — it proves the call came from the store app, and says nothing about *who* is calling. It parses `Basic <base64>` and compares both halves of the pair from the `store` config namespace with the timing-safe string helper, exactly like the admin guard, but reads them from **`x-store-authorization`, not `Authorization`**. That header is not a stylistic choice: the store's authenticated routes already spend `Authorization` on the customer's Bearer JWT, and the two credentials must travel together on the same request. Do not move it back.

  It sits **first** in all four `StoreAuth` levels, so it is the app credential that is checked before the device id and before any token. It carries **no identity** and **no failed-attempt lockout** — unlike the admin guard, whose credential is typed by a person, this one is sent by the app on *every* request, so counting failures per IP would lock out legitimate users behind a shared NAT the moment an outdated app build shipped a stale credential. The abuse it would have slowed is already covered where it matters: the OTP routes and `sync-device-id` are throttled.

- **Access-token guard**: extends the Passport JWT guard, triggering the access strategy that places the decoded payload on the request. It is an empty subclass on purpose — naming the strategy is its whole job.
- **Refresh-token guard**: extends the Passport JWT guard with the separate refresh strategy/secret; used on the **customer** refresh and logout routes (the two that carry a customer refresh token). The delivery-person refresh route has its own guard — see below.
- **Admin basic-auth guard**: a standalone guard (implementing the guard interface directly, not Passport-based), named after *whose* credentials it checks — never after the mechanism alone, since it accepts only admin credentials. It parses the `Authorization: Basic` header and compares both halves of the single operator credential pair from its config namespace with the timing-safe string helper. It carries **no identity** — every admin request is the same principal.

  It also provides **brute-force protection**: each failed attempt is counted per IP through the injected `ThrottlerStorage`, under its own rate-limit window and storage key prefix (`admin-login:<ip>`), so audiences never share a bucket. Over the limit it throws `AUTH_007` (429); successful logins never increment. Note the lockout name is deliberately **not** a registered throttler name — the guard bypasses the throttler guards entirely and passes the literal name straight to the storage, so it must not be added to the canonical name lists.

- **Delivery-person basic-auth guard**: the delivery app's **application credential**, the exact counterpart of the store one — it proves the call came from the delivery app and says nothing about *who* is calling. It parses `Basic <base64>` and compares both halves of the pair from the `deliveryPerson` config namespace with the timing-safe string helper, reading **`x-delivery-person-authorization`, not `Authorization`**: this surface already spends `Authorization` on the opaque bearer token, and the two credentials must travel together on the same request.

  It sits **first** in all three `DeliveryPersonAuth` levels, so the app credential is checked before any session lookup hits the database — including on `login`, which is why that route is no longer credential-less. It carries **no identity** and, like the store guard and unlike the admin one, **no failed-attempt lockout**: it is resent by the app on every request, so counting failures per IP would lock out a whole crew behind a shared NAT the moment an outdated build shipped a stale credential. The brute-force surface that matters here is the *login* credential (CPF + password), and its per-IP lockout lives in `src/apps/delivery-persons/auth/`.

- **Delivery-person access-token guard**: authenticates the delivery app's **opaque bearer token** against the session table. It hashes the presented token with the shared string helper and looks the session up by that hash, then rejects an expired `accessTokenExpiresAt` or an inactive delivery person. On success it places `{ id }` on `request.deliveryPerson`, which `@CurrentDeliveryPerson()` reads back.

  Every rejection resolves to `null` in a single private resolver and is translated into **one** throw at the end of `canActivate`: `AppException` with `DELIVERY_PERSONS_AUTH_003` (401). This is deliberate — denying with `false` would produce a 403 with the `UNKNOWN` fallback and an English framework message, while the customer JWT guard answers 401 for the same situation. All four causes (no token, unknown token, expired token, deactivated/revoked delivery person) collapse into that one response on purpose; the client reacts by refreshing, and only the refresh endpoint tells it the session is gone (see `references/api-contract.md`). Do not split it into per-cause codes.

  The identity is the **token itself**, so there is no ownership rule and no id param to reconcile — the previous Basic Auth guard checked the route's `:deliveryPersonId` against the credential and fell **open** on any route naming the param differently. Routes now live under `delivery-persons/`; do not reintroduce an id param on this surface.

  Checking `isActive` on every request is deliberate belt-and-braces: the admin already deletes the session on deactivation and revocation, and this catches any session that outlives either.

  It carries **no failed-attempt lockout**, unlike the admin guard. A 32-byte random token is not guessable and the lookup is a single indexed read, so there is nothing to slow down — the brute-force surface is the *login* endpoint, and the lockout lives there (see `src/apps/delivery-persons/auth/AGENTS.md`).

- **Delivery-person refresh-token guard**: the same shape as the access-token guard, one route wide — it gates `POST delivery-persons/auth/refresh`. It matches on `hashedRefreshToken` instead of `hashedAccessToken`, checks `refreshTokenExpiresAt`, re-checks `isActive`, and throws `DELIVERY_PERSONS_AUTH_002` (401). That code has **two producers**, by design: this guard for an unknown, expired, or deactivated session, and the service for a rotation that loses the count-guarded race. Both must keep the same code and message — the client cannot tell the causes apart and must not have to. It covers one route rather than a controller, so it reaches that route as the `refreshToken` **level** of the delivery-person composite, applied on the handler — the sibling route (login) sits at `basic`, and a controller whose routes need different levels declares them per handler, exactly as the store auth controller does.

  On success it places `{ id, hashedRefreshToken }` on `request.deliveryPersonSession`, which `@CurrentDeliveryPersonSession()` reads back. It hands over the **hash as well as the id** on purpose: the service's rotation is a count-guarded update matching both, and that hash in the `where` is what makes a replay or a concurrent refresh lose the race. Passing the id alone would silently turn the count guard into an ordinary write.

  Like the access-token guard it carries **no lockout** — same reasoning, an unguessable 32-byte token against one indexed read.

- **Throttler guards**: rate-limiting guards extending `@nestjs/throttler`'s `ThrottlerGuard`. A shared abstract base (`BaseThrottlerGuard`) overrides `throwThrottlingException` to throw `AppException` with `AUTH_007` (HTTP 429) instead of the library's generic exception, so the response matches the API contract. `OtpThrottlerGuard` overrides `getTracker` to key by the `x-device-id` header (falling back to the IP) and gates the OTP send/login routes; `IpThrottlerGuard` keeps the default IP tracker and gates the session-less `sync-device-id` route (so device-id minting can't be used to bypass the per-device OTP limits). Routes opt in through typed composite decorators that bundle the right guard with the throttler names to **keep** (skipping the rest): the device-keyed composite pairs the **OTP throttler guard** with the device-keyed throttler names, and the IP-keyed composite pairs the IP throttler guard with the IP-keyed names. (Neither composite bundles a `StoreAuth` guard: a throttled route stacks its `StoreAuth` alongside its throttle composite — `deviceId` on the OTP routes, `basic` on `sync-device-id` — so the two concerns stay independently declared. **Decorator order matters there** — see the note below.) The throttler names are split by tracker into a single canonical source (also consumed when registering the module), so a name can only be used with the composite whose tracker matches it — pairing the wrong guard with a name is a compile error. Like the delivery-person access-token guard, throttler guards **throw** (a 429) rather than denying with `false`.

**None of the standalone audience guards** (store Basic Auth, admin Basic Auth, delivery-person access and refresh) is registered globally, and **none is declared in a module's `providers`** — applying it with `@UseGuards` is the whole registration: Nest's scanner reads the guard metadata off the controller and registers the class as an injectable of the module that owns it. A guard still injects its dependencies like any other provider (Prisma, the config service, the throttler storage), resolved through the host module's injector — those all come from global modules. They **deliberately duplicate** their header parsing instead of sharing a base class. Between the token guards and the Basic ones the audiences have fully diverged — a static credential checked per request versus a database-backed session identity. The store, admin, and delivery-person Basic guards are the near-identical trio, and they stay apart on purpose: they read **three different headers** (`x-store-authorization`, `Authorization`, `x-delivery-person-authorization`), answer to three different config namespaces, and only the admin one counts failed attempts. A shared base would have to be parameterized on all three axes, and the next audience would bend it again. The delivery-person guard was written as a fourth standalone copy for exactly this reason — do not re-unify them; when a new audience appears, write it as another standalone guard.

---

## Audience Auth Decorators

**Every audience has exactly one composite decorator**, and applying it is the only way a route gets protected. `AdminAuth()` applies the admin Basic Auth guard; `StoreAuth(level)` and `DeliveryPersonAuth(level)` each apply their audience's stack for the level named. None of them bypasses anything — a composite applies its own guard(s) and nothing else, so the admin and delivery surfaces are free of the `x-device-id` requirement simply by never asking for it. A new audience means a new credential store, a new standalone guard, and a new composite; it never means reusing another audience's.

**Two composites take a parameter** — store and delivery-person — because those apps have several credential levels rather than one; the admin's single credential needs none. All four start at the **app credential**, the next three add the device id, and the last two then branch — the access and refresh levels are **siblings**, not a ladder, since a refresh token is a different credential from an access token rather than a stronger one:

| Level | Guards applied | Used by |
|---|---|---|
| `StoreAuth("basic")` | store basic-auth | session-less routes — categories, settings, `sync-device-id` |
| `StoreAuth("deviceId")` | store basic-auth → device-id | anonymous session routes — cart, products, OTP send/login |
| `StoreAuth("accessToken")` | store basic-auth → device-id → access-token | authenticated routes — me, orders, coupons, notifications |
| `StoreAuth("refreshToken")` | store basic-auth → device-id → refresh-token | the two routes carrying a customer refresh token — refresh and logout |

The store basic-auth guard is inside all four because the app credential is **unconditional**: every store route requires it, so no level can opt out. The device-id guard is inside the other three because the customer session is **additive** — an authenticated request still carries the device id its cart and catalog lookups are keyed by. Picking a level is therefore never a choice between the app credential *or* a session — it is a choice of **which credential the route consumes on top of the app credential**. Adding a fifth level means adding a row to the map in the decorator, not a new decorator.

The delivery-person composite has the same shape, one level shorter — there is no device id on this surface:

| Level | Guards applied | Used by |
|---|---|---|
| `DeliveryPersonAuth("basic")` | delivery-person basic-auth | `POST delivery-persons/auth/login` — it mints the first token pair, so it consumes no session credential |
| `DeliveryPersonAuth("accessToken")` | delivery-person basic-auth → access-token | every controller outside `auth/` — the delivery queue, the delivery confirmation, the shift count |
| `DeliveryPersonAuth("refreshToken")` | delivery-person basic-auth → refresh-token | the one route carrying a delivery refresh token — `POST delivery-persons/auth/refresh` |

Here too `accessToken` and `refreshToken` are **siblings, not a ladder**, and the basic guard is inside all three because the app credential is unconditional. **The delivery surface has no credential-less route either**: `login` is unauthenticated in the sense that it carries no *session*, never in the sense that it carries nothing — `basic` is its floor, exactly as it is the store's.

**Every store controller carries a `StoreAuth`; there is no open level.** The three routes that need no session (categories, settings, `sync-device-id`) sit at `basic` — session-less, but never credential-less. A store controller with no decorator at all would be a genuine hole, and the opt-in model has no global guard left to catch it, so a new store controller must state its level explicitly and `basic` is the floor, never "none".

**Stacked composites run bottom-up.** `UseGuards` *appends* to the guard metadata (`extendArrayMetadata`), and method decorators are applied from the signature upwards — so the decorator written **closest to the handler runs first**. On the OTP routes that means `@StoreAuth("deviceId")` sits *below* `@DeviceThrottle(...)`, and on `sync-device-id` `@StoreAuth("basic")` sits *below* `@IpThrottle(...)` — both read backwards, which is exactly why it is worth stating: the credential is validated before a throttle slot is spent, never after. Reordering those two lines silently changes which guard rejects an invalid header, so `store-auth.decorator.spec.ts` pins the composition of each level.

**A route whose credential differs from the audience's ordinary one becomes a level of that audience's composite, not a bare `@UseGuards`** — the delivery-person refresh guard used to sit straight on the handler, and became the `refreshToken` level once the app credential had to precede it on every route. Reach for a bare `@UseGuards` only for a guard that is not part of any audience's credential story; anything a route needs *on top of* its audience's app credential belongs in the composite, so the order of the two can be pinned by a test.

The delivery-person composite keeps its name (`DeliveryPersonAuth`) across the change from Basic Auth to tokens and again across gaining levels — the composite names the *audience*, not the mechanism, so swapping or stacking guards behind it is not a rename.

---

## Conventions

| Rule | Detail |
|---|---|
| No global guards | Nothing is registered as `APP_GUARD`. Auth is opt-in per route, through the audience composite |
| One directory per audience | A guard lives under `store/`, `admin/`, or `delivery-persons/`, chosen by the credential or header it reads; its spec lives in that directory's `__tests__/`. A guard that reads no audience header — the throttler base and the IP tracker — stays at the root |
| Per-scope auth | Every guard — device-id included — is applied per controller/route, never globally |
| A guard is never listed in `providers` | `@UseGuards` (bare or through the audience composite) is the registration — Nest picks the class up from the controller metadata and injects its dependencies. No guard needs an explicit entry anywhere. Passport strategies are not guards: they stay in `providers` |
| One guard per audience | Each audience gets its own standalone guard — own credential store, own header, and its own answer on whether failed attempts are counted (the admin guard has a lockout window and storage key; the store and delivery-person guards deliberately have neither) — named after the audience. The duplication is intentional |
| Composite per controller, unless the levels differ | An audience composite gates a whole controller at class level. It moves to the handler when one controller mixes levels — as store `auth/` does, where its routes sit at three different levels, and as delivery `auth/` does, where `login` is `basic` and `refresh` is `refreshToken` |
| Every store and delivery route declares its level | A controller without its audience composite reaches the handler with no credential at all. With no global guard left to catch an omission, `basic` is the floor for a session-less route on both surfaces — never a missing decorator |
| One `Authorization` header, one credential | A second credential on the same request needs its own header. The store app credential rides `x-store-authorization` and the delivery one rides `x-delivery-person-authorization`, precisely because the customer JWT and the delivery opaque token already own `Authorization` on their surfaces |
| Static credentials compared in constant time | The store, admin, and delivery-person basic-auth guards compare their config credential pair with the timing-safe string helper; a stored password goes through the password helper (bcrypt already compares in constant time) |
| Opaque tokens are looked up by hash | Never store or query a bearer token in plaintext — hash it with the shared string helper and match on the hash column |
| Identity comes from the token, not the path | A guard that resolves an individual puts the id on the request for its param decorator; authenticated routes carry no id param to reconcile |
| Deny with the audience's own status | The device-id and the three basic-auth guards (store, admin, delivery-person) deny by returning false (the framework maps it to a forbidden response); the delivery-person access- and refresh-token guards throw a 401 `AppException` so their audience matches the customer JWT guard, and rate limiting (throttler guards, admin lockout) throws a 429 `AppException`. A delivery request missing the app credential is therefore a **403**, while one missing or presenting a bad token is a **401** — the two failures are distinguishable on purpose, since only the second is refreshable. A guard that throws must use `AppException` with a registered code and a pt-BR message — never a raw framework exception |
| Rate-limit errors via `AppException` | Rate limiting (throttler guards, the admin lockout, and the delivery-person login lockout) translates a limit breach into `AUTH_007` (429) so the response matches the API contract |
