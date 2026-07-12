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

Admin request
  └── device-id guard (global) → public → pass through
        └── basic-auth guard (per controller, via the admin-auth composite)
              ├── validate HTTP Basic Auth credentials
              └── on failure, count the attempt per IP; over the limit → throw 429 (AUTH_007)
```

The refresh-token guard is applied on the two routes that present a refresh token: token refresh and logout.

---

## Guard Roles

- **Device-id guard**: reads the `x-device-id` header and validates it as a UUID; public routes bypass it; it only gates access and does not populate the request user.
- **Access-token guard**: extends the Passport JWT guard, triggering the access strategy that places the decoded payload on the request; respects the public marker via the reflector.
- **Refresh-token guard**: extends the Passport JWT guard with the separate refresh strategy/secret; used on the refresh and logout routes (the two that carry a refresh token).
- **Basic-auth guard**: implements the guard interface directly (not Passport-based), validating credentials from the `Authorization: Basic` header against the admin config namespace; never registered globally. It also provides **brute-force protection**: each failed attempt is counted per IP through the injected `ThrottlerStorage` (under the `rateLimit.admin` window), and once the failed-attempt limit is exceeded it throws `AUTH_007` (429). Successful logins never increment, so legitimate backoffice traffic is never throttled. Note that `admin` is deliberately **not** one of the registered throttler names — the guard bypasses the throttler guards entirely and passes the literal name straight to the storage, so it must not be added to the canonical name lists.
- **Throttler guards**: rate-limiting guards extending `@nestjs/throttler`'s `ThrottlerGuard`. A shared abstract base (`BaseThrottlerGuard`) overrides `throwThrottlingException` to throw `AppException` with `AUTH_007` (HTTP 429) instead of the library's generic exception, so the response matches the API contract. `OtpThrottlerGuard` overrides `getTracker` to key by the `x-device-id` header (falling back to the IP) and gates the OTP send/login routes; `IpThrottlerGuard` keeps the default IP tracker and gates the public `sync-device-id` route (so device-id minting can't be used to bypass the per-device OTP limits). Routes opt in through typed composite decorators that bundle the right guard with the throttler names to **keep** (skipping the rest): the device-keyed composite pairs the **OTP throttler guard** with the device-keyed throttler names, and the IP-keyed composite pairs the IP throttler guard with the IP-keyed names. (Neither composite bundles the device-id guard — that one is global.) The throttler names are split by tracker into a single canonical source (also consumed when registering the module), so a name can only be used with the composite whose tracker matches it — pairing the wrong guard with a name is a compile error. Unlike the other guards, throttler guards **throw** (a 429) rather than denying with `false` — this is intentional and the only exception to the no-throw rule.

---

## Public & Admin-Auth Decorators

The public marker sets route metadata that both the device-id and access-token guards read via the reflector. The admin-auth composite combines the public marker with the basic-auth guard and is applied at controller class level on admin controllers — so admin routes skip device-id/JWT and are gated solely by Basic Auth (which enforces its own per-IP failed-attempt limit).

---

## Conventions

| Rule | Detail |
|---|---|
| Single global guard | Only the device-id guard is registered globally |
| Per-scope auth | Access-token and basic-auth guards are applied per controller/route, never globally |
| Never throw in guards | Deny by returning false; the framework maps it to a forbidden response — **except** rate limiting, where throttler guards and the basic-auth failed-attempt lockout throw a 429 `AppException` by design |
| Reflector for metadata | Guards that honor the public marker inject the reflector |
| Rate-limit errors via `AppException` | Rate limiting (throttler guards and the basic-auth lockout) translates a limit breach into `AUTH_007` (429) so the response matches the API contract |
