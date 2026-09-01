# AGENTS.md — src/shared/guards/

## Guard Chain

**No guard is global.** Every route states its own protection through its audience's composite decorator, and a route with no decorator is genuinely unauthenticated — with two audience-wide exceptions: the store **and** the delivery app each have a floor (their `basic` level, an app credential no route opts out of), so a decorator-less controller on either surface is a hole rather than a decision. Only the admin surface has a single level and no floor to forget. There is no public marker and no reflector lookup anywhere in this directory — a guard that runs, runs unconditionally.

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

The admin and delivery-person surfaces send **no `x-device-id`** — their composites simply never apply the device-id guard, rather than bypassing it. They do each carry an **app credential** of their own: admin on `Authorization: Basic`, delivery on `x-delivery-person-authorization: Basic`.

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

Each audience directory owns its own `__tests__/`. A guard goes into the directory of the audience whose **credential or header** it reads — never the one that happens to use it first (e.g. the device-id guard sits under `store/` because the header is the customer app's). Rate-limiting guards split the same way, by what they **track**: `OtpThrottlerGuard` keys on `x-device-id` and lives under `store/`; `BaseThrottlerGuard` (translates a breach to `AUTH_007`) and `IpThrottlerGuard` (default IP tracker) read no audience header and stay at the root, reusable as-is by any future audience's rate limit.

Filenames keep the audience prefix they already carried (`store-basic-auth.guard.ts`) even though the directory now repeats it — file and class name stay in step; do not strip the prefix on a move.

---

## Guards by Level

Each composite applies its guards **in order**, top to bottom. **Every audience gets its own standalone guard** (own credential store, own header, its own answer on failed-attempt counting) — they deliberately duplicate header-parsing instead of sharing a base class, since the three Basic guards alone already diverge on three headers, three config namespaces, and only one lockout.

| Composite / level | Guards (in order) | Credential / header | Denies with | Notes |
|---|---|---|---|---|
| `AdminAuth()` | admin basic-auth | `Authorization: Basic`, admin config namespace | 403 (bad credential) · 429 `AUTH_007` (lockout) | No identity — every admin request is the same principal. Per-IP failed-attempt lockout via injected `ThrottlerStorage`, key `admin-login:<ip>` — a name deliberately outside the registered throttler names, since this guard bypasses the throttler guards entirely |
| `StoreAuth("basic")` | store basic-auth | `x-store-authorization: Basic`, store config | 403 | The store app credential — proves the app, not the caller. No lockout: resent on every request, so counting per IP would lock out a shared NAT the moment a build ships a stale credential. Session-less routes (categories, settings, `sync-device-id`) sit here — never lower |
| `StoreAuth("deviceId")` | + device-id | + `x-device-id` (UUID) | 403 | Device-id guard has no dependencies and no metadata lookup — it only validates the header |
| `StoreAuth("accessToken")` | + access-token | + `Authorization: Bearer <JWT>` (access strategy) | 401 | Passport strategy places the decoded payload on the request |
| `StoreAuth("refreshToken")` | + refresh-token | + `Authorization: Bearer <JWT>` (refresh strategy/secret) | 401 | Only the two routes carrying a customer refresh token (refresh, logout) |
| `DeliveryPersonAuth("basic")` | delivery-person basic-auth | `x-delivery-person-authorization: Basic`, deliveryPerson config | 403 | The delivery app credential, exact counterpart of the store one. No device id on this surface. Login sits here — it is session-less, never credential-less |
| `DeliveryPersonAuth("accessToken")` | + access-token | + `Authorization: Bearer <opaque token>` | 401 `DELIVERY_PERSONS_AUTH_003` | Looks the session up by the sha256 hash of the token; rejects unknown/expired token or inactive delivery person, all collapsed into this one code on purpose (client just refreshes). Places `{ id }` on `request.deliveryPerson`. No lockout — an unguessable 32-byte token needs none |
| `DeliveryPersonAuth("refreshToken")` | + refresh-token | + `Authorization: Bearer <opaque refresh token>` | 401 `DELIVERY_PERSONS_AUTH_002` | Matches `hashedRefreshToken`; this code has **two producers** by design — this guard and the service's count-guarded rotation losing a race — both must keep the same code/message. Places `{ id, hashedRefreshToken }` on `request.deliveryPersonSession`, the hash included so the service's rotation can match on it |
| Throttler guards (stacked on top of a composite) | `OtpThrottlerGuard` (OTP send/login, keyed by `x-device-id`) · `IpThrottlerGuard` (`sync-device-id`, keyed by IP) | — | 429 `AUTH_007` | Composite decorators bundle the guard with the throttler names to keep; pairing the wrong guard with a name is a compile error |

Both delivery-person token guards check `isActive` on every request as belt-and-braces (deactivation/revocation already deletes the session — this catches one that outlives it), and neither takes an id param: identity comes from the token, resolved to `{ id }`/`{ id, hashedRefreshToken }` on the request for the matching `@Current...()` decorator to read.

**Stacked composites run bottom-up** — `UseGuards` appends to guard metadata and method decorators apply from the signature upward, so the decorator closest to the handler runs first. On the OTP routes `@StoreAuth("deviceId")` sits below `@DeviceThrottle(...)`; the credential is validated before a throttle slot is spent. A pinning test (`store-auth.decorator.spec.ts`) guards this order — reordering the two lines silently changes which guard rejects first.

A route whose credential differs from its audience's ordinary one becomes a **level** of that audience's composite (as the delivery-person refresh guard did), never a bare `@UseGuards` — that stays reserved for a guard outside every audience's credential story.

A composite gates a whole controller at class level, moving to the handler only when one controller mixes levels (store `auth/`, three levels; delivery `auth/`, `login` at `basic` and `refresh` at `refreshToken`).

---

## Conventions

| Rule | Detail |
|---|---|
| No global guards | Nothing is registered as `APP_GUARD`. Auth is opt-in per route, through the audience composite |
| One directory per audience | Chosen by the credential or header a guard reads; its spec lives in that directory's `__tests__/`. The throttler base and IP tracker, reading no audience header, stay at the root |
| Per-scope auth | Every guard — device-id included — is applied per controller/route, never globally |
| A guard is never listed in `providers` | `@UseGuards` (bare or via composite) is the whole registration — Nest reads the class off the controller metadata and injects its dependencies from the host module's injector. Passport strategies are not guards and do stay in `providers` |
| One guard per audience, no shared base | Each audience's guard duplicates header parsing on purpose — the near-identical Basic trio reads three different headers, answers to three different config namespaces, and only one counts failed attempts. A new audience means a new standalone guard, never a parameterized shared one |
| One `Authorization` header, one credential | A second credential on the same request needs its own header — `x-store-authorization` / `x-delivery-person-authorization`, since `Authorization` is already spent on the customer JWT / delivery opaque token on their respective surfaces |
| Static credentials compared in constant time | The three Basic guards use the timing-safe string helper; a stored password goes through the password helper (bcrypt) |
| Opaque tokens are looked up by hash | Never store or query a bearer token in plaintext — hash with the shared string helper and match on the hash column |
| Identity comes from the token, not the path | A guard that resolves an individual puts the id on the request for its param decorator; no id param is ever reconciled against the identity |
| Deny with the audience's own status | The device-id and three Basic guards deny with `false` (→ 403). The delivery-person token guards and rate limiting throw a typed `AppException` (401 / 429) instead, matching the customer JWT guard's behavior — a delivery request missing the app credential is a 403, one with a missing/bad token is a 401, distinguishable because only the second is refreshable. Any guard that throws must use a registered `AppException` code and a pt-BR message, never a raw framework exception |
