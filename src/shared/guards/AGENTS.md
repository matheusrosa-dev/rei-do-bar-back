# AGENTS.md — src/shared/guards/

## Guard Chain

Only the **device-id guard is global** (registered as an app guard). The others are applied per controller or per route.

```
Every request
  └── device-id guard (global)
        ├── public route → pass through
        └── require a valid UUID in the x-device-id header
              └── access-token guard (per controller/route)
                    ├── public route → pass through
                    └── validate the bearer JWT

Rate-limited routes (per route)
  └── throttler guard (OTP routes by device-id, device-id sync by IP)
        └── over the limit → throw 429 (AUTH_007)

Admin backoffice request (HTTP Basic Auth)
  └── device-id guard (global) → public → pass through
        └── admin basic-auth guard (per controller, via the admin auth composite)
              ├── validate the credential pair against the admin config namespace
              └── on failure, count the attempt per IP in the admin bucket;
                  over the limit → throw 429 (AUTH_007)

Delivery-person app request (opaque bearer token)
  └── device-id guard (global) → public → pass through
        └── delivery-person access-token guard (per controller, via its auth composite)
              ├── resolve the session row by the sha256 hash of the bearer token
              ├── reject a missing/unknown token, an expired one,
              │   or an inactive delivery person
              │   → throw 401 (DELIVERY_PERSONS_AUTH_003)
              └── place the delivery person's id on the request

Delivery-person refresh (opaque bearer token, one route)
  └── device-id guard (global) → public → pass through
        └── delivery-person refresh-token guard (on the refresh route only)
              ├── resolve the session row by the sha256 hash of the bearer token
              ├── reject a missing/unknown token, an expired one,
              │   or an inactive delivery person
              │   → throw 401 (DELIVERY_PERSONS_AUTH_002)
              └── place the session id and the presented hash on the request
```

The Passport **refresh-token guard** is applied on the two **customer** routes that present a refresh token: token refresh and logout. It is a customer-flow guard, not a general one — it validates a JWT signature, which an opaque token has none of. The delivery app's refresh route is covered by its own database-backed guard instead (see below).

---

## Guard Roles

- **Device-id guard**: reads the `x-device-id` header and validates it as a UUID; public routes bypass it; it only gates access and does not populate the request user.
- **Access-token guard**: extends the Passport JWT guard, triggering the access strategy that places the decoded payload on the request; respects the public marker via the reflector.
- **Refresh-token guard**: extends the Passport JWT guard with the separate refresh strategy/secret; used on the **customer** refresh and logout routes (the two that carry a customer refresh token). The delivery-person refresh route has its own guard — see below.
- **Admin basic-auth guard**: a standalone guard (implementing the guard interface directly, not Passport-based), named after *whose* credentials it checks — never after the mechanism alone, since it accepts only admin credentials. It parses the `Authorization: Basic` header and compares both halves of the single operator credential pair from its config namespace with the timing-safe string helper. It carries **no identity** — every admin request is the same principal.

  It also provides **brute-force protection**: each failed attempt is counted per IP through the injected `ThrottlerStorage`, under its own rate-limit window and storage key prefix (`admin-login:<ip>`), so audiences never share a bucket. Over the limit it throws `AUTH_007` (429); successful logins never increment. Note the lockout name is deliberately **not** a registered throttler name — the guard bypasses the throttler guards entirely and passes the literal name straight to the storage, so it must not be added to the canonical name lists.

- **Delivery-person access-token guard**: authenticates the delivery app's **opaque bearer token** against the session table. It hashes the presented token with the shared string helper and looks the session up by that hash, then rejects an expired `accessTokenExpiresAt` or an inactive delivery person. On success it places `{ id }` on `request.deliveryPerson`, which `@CurrentDeliveryPerson()` reads back.

  Every rejection resolves to `null` in a single private resolver and is translated into **one** throw at the end of `canActivate`: `AppException` with `DELIVERY_PERSONS_AUTH_003` (401). This is deliberate — denying with `false` would produce a 403 with the `UNKNOWN` fallback and an English framework message, while the customer JWT guard answers 401 for the same situation. All four causes (no token, unknown token, expired token, deactivated/revoked delivery person) collapse into that one response on purpose; the client reacts by refreshing, and only the refresh endpoint tells it the session is gone (see `references/api-contract.md`). Do not split it into per-cause codes.

  The identity is the **token itself**, so there is no ownership rule and no id param to reconcile — the previous Basic Auth guard checked the route's `:deliveryPersonId` against the credential and fell **open** on any route naming the param differently. Routes now live under `delivery-persons/`; do not reintroduce an id param on this surface.

  Checking `isActive` on every request is deliberate belt-and-braces: the admin already deletes the session on deactivation and revocation, and this catches any session that outlives either.

  It carries **no failed-attempt lockout**, unlike the admin guard. A 32-byte random token is not guessable and the lookup is a single indexed read, so there is nothing to slow down — the brute-force surface is the *login* endpoint, and the lockout lives there (see `src/apps/delivery-persons/auth/AGENTS.md`).

- **Delivery-person refresh-token guard**: the same shape as the access-token guard, one route wide — it gates `POST delivery-persons/auth/refresh`. It matches on `hashedRefreshToken` instead of `hashedAccessToken`, checks `refreshTokenExpiresAt`, re-checks `isActive`, and throws `DELIVERY_PERSONS_AUTH_002` (401). That code has **two producers**, by design: this guard for an unknown, expired, or deactivated session, and the service for a rotation that loses the count-guarded race. Both must keep the same code and message — the client cannot tell the causes apart and must not have to. Because it covers one route rather than a controller, it is `@UseGuards`'d directly on the handler; the `@Public()` marker stays at class level for the device-id guard.

  On success it places `{ id, hashedRefreshToken }` on `request.deliveryPersonSession`, which `@CurrentDeliveryPersonSession()` reads back. It hands over the **hash as well as the id** on purpose: the service's rotation is a count-guarded update matching both, and that hash in the `where` is what makes a replay or a concurrent refresh lose the race. Passing the id alone would silently turn the count guard into an ordinary write.

  Like the access-token guard it carries **no lockout** — same reasoning, an unguessable 32-byte token against one indexed read.

- **Throttler guards**: rate-limiting guards extending `@nestjs/throttler`'s `ThrottlerGuard`. A shared abstract base (`BaseThrottlerGuard`) overrides `throwThrottlingException` to throw `AppException` with `AUTH_007` (HTTP 429) instead of the library's generic exception, so the response matches the API contract. `OtpThrottlerGuard` overrides `getTracker` to key by the `x-device-id` header (falling back to the IP) and gates the OTP send/login routes; `IpThrottlerGuard` keeps the default IP tracker and gates the public `sync-device-id` route (so device-id minting can't be used to bypass the per-device OTP limits). Routes opt in through typed composite decorators that bundle the right guard with the throttler names to **keep** (skipping the rest): the device-keyed composite pairs the **OTP throttler guard** with the device-keyed throttler names, and the IP-keyed composite pairs the IP throttler guard with the IP-keyed names. (Neither composite bundles the device-id guard — that one is global.) The throttler names are split by tracker into a single canonical source (also consumed when registering the module), so a name can only be used with the composite whose tracker matches it — pairing the wrong guard with a name is a compile error. Like the delivery-person access-token guard, throttler guards **throw** (a 429) rather than denying with `false`.

**None of the standalone audience guards** (admin Basic Auth, delivery-person access and refresh) is registered globally; each is declared as a provider in the modules whose controllers use it. A guard that authenticates against the database injects the Prisma service like any other provider. They **deliberately duplicate** their header parsing instead of sharing a base class: the audiences have fully diverged — a static operator credential checked per request versus a database-backed session identity. Do not re-unify them; when a new audience appears, write it as another standalone guard.

---

## Public & Audience Auth Decorators

The public marker sets route metadata that both the device-id and access-token guards read via the reflector. Each non-customer audience has its own composite decorator pairing the public marker with that audience's guard, applied at controller class level — so those routes skip the device-id and JWT guards and are gated solely by their own mechanism (admin: Basic Auth with a per-IP failed-attempt limit; delivery person: an opaque bearer token). A new audience means a new credential store, a new standalone guard, and a new composite; it never means reusing another audience's.

**A guard covering a single route inside an otherwise public controller is not folded into the audience composite** — it goes straight on the handler with `@UseGuards`, leaving the public marker at class level. A composite bundles the public marker *with* a guard, so applying one per handler would re-declare what the class already says; and a route whose credential differs from the audience's ordinary one is not the audience's composite to begin with.

The delivery-person composite keeps its name (`DeliveryPersonAuth`) across the change from Basic Auth to tokens — the composite names the *audience*, not the mechanism, so swapping the guard behind it is not a rename.

---

## Conventions

| Rule | Detail |
|---|---|
| Single global guard | Only the device-id guard is registered globally |
| Per-scope auth | Access-token and audience guards are applied per controller/route, never globally |
| One guard per audience | Each audience gets its own standalone guard — own credential store, own lockout window, own storage key — named after the audience. The duplication is intentional; the audiences have fully diverged |
| Composite per controller, bare guard per route | An audience composite gates a whole controller at class level; a guard covering one route in an otherwise public controller is applied directly on the handler instead, with the public marker left on the class |
| Static credentials compared in constant time | The admin guard compares its config credential pair with the timing-safe string helper; a stored password goes through the password helper (bcrypt already compares in constant time) |
| Opaque tokens are looked up by hash | Never store or query a bearer token in plaintext — hash it with the shared string helper and match on the hash column |
| Identity comes from the token, not the path | A guard that resolves an individual puts the id on the request for its param decorator; authenticated routes carry no id param to reconcile |
| Deny with the audience's own status | The device-id and admin guards deny by returning false (the framework maps it to a forbidden response); the delivery-person access- and refresh-token guards throw a 401 `AppException` so their audience matches the customer JWT guard, and rate limiting (throttler guards, admin lockout) throws a 429 `AppException`. A guard that throws must use `AppException` with a registered code and a pt-BR message — never a raw framework exception |
| Reflector for metadata | Guards that honor the public marker inject the reflector |
| Rate-limit errors via `AppException` | Rate limiting (throttler guards, the admin lockout, and the delivery-person login lockout) translates a limit breach into `AUTH_007` (429) so the response matches the API contract |
