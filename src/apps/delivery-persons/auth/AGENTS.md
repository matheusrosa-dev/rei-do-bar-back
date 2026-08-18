# AGENTS.md — src/apps/delivery-persons/auth/

## What belongs here

The login and session lifecycle of the delivery app: CPF + password login, and refresh-token rotation. Neither endpoint takes an *access* token: login carries a credential, refresh carries a refresh token, and both are what a delivery person calls when they cannot make an ordinary authenticated request.

## What does NOT belong here

- The guards that validate an issued token — access **and** refresh → `src/shared/guards/`. This module mints tokens; the only check it keeps is the count guard on the rotation write, which is a concurrency guard, not an authentication one. A shared guard still has to be **declared as a provider here**, since it injects Prisma and this module owns the controller that applies it.
- Password assignment and access revocation → `src/apps/admin/delivery-persons/`. The delivery person never sets or changes their own password, and cannot revoke their own session.
- Customer OTP/JWT authentication → `src/apps/store/auth/`.

---

## Endpoints

| Route | Credential | Returns |
|---|---|---|
| `POST delivery-persons/auth/login` | body: `cpf` (11 digits), `password` (8–72) | the token pair |
| `POST delivery-persons/auth/refresh` | header: `Authorization: Bearer <refreshToken>`, no body | the same two fields, freshly minted |

Both are marked `@Public()` at class level: the global device-id guard would otherwise demand an `x-device-id` header the delivery app does not send. The marker stays on `refresh` despite its guard — it only bypasses the *device-id* guard.

**The refresh token travels in the `Authorization` header**, like every other bearer token on this surface and like the customer flow. `DeliveryPersonRefreshTokenGuard` extracts and validates it before the handler runs, so the route has **no request DTO** — only the class-level response DTO applies. An absent or malformed header is a 401 `DELIVERY_PERSONS_AUTH_002`, not a 422. Do not move it back into the body — header extraction belongs in a guard, never in the controller.

---

## Core Patterns

- **One error for every failure mode.** Unknown CPF, wrong password, inactive, no password set → all `INVALID_CREDENTIALS` (401), same message. Do not add a more specific error, and do not let one branch return early with a different status — the response body must not say *which* half of the credential was wrong.
- **The login short-circuits before bcrypt** when there is no real hash to check (unknown CPF, inactive, or no password set), so those paths answer faster than a wrong password does. That timing difference is a **known, accepted user-enumeration oracle**: someone can probe CPFs and tell registered from unregistered by response time. The per-IP failed-attempt lockout is what limits how fast they can probe. This was a deliberate call — if you want it closed, the fix is to verify against a throwaway hash so every path pays the same bcrypt round, not to add a delay.
- **Session upsert, not insert.** Login upserts on the unique `deliveryPersonId`, so a new login replaces the old session rather than accumulating one per device.
- **Validation lives in the guard; the service only rotates.** `DeliveryPersonRefreshTokenGuard` resolves the session by the presented hash and rejects an unknown, expired, or deactivated one — the same *guard resolves, decorator reads* split the access-token guard already uses. The service receives `{ id, hashedRefreshToken }` from `@CurrentDeliveryPersonSession()` and never looks the session up again, so the flow still costs one read plus one write. Do not re-add a lookup in the service.
- **Rotation is a count-guarded conditional update.** The repo-wide invariant for a single-use secret is a **count-guarded conditional write, never read-then-write**; `src/apps/store/auth/AGENTS.md` states it in terms of a conditional *delete* because that is how the customer flow consumes OTPs and rotates refresh tokens. Here the session row must survive the rotation, so the same invariant takes the form of an update. The update matches on the id **and** the presented refresh hash — the hash is what makes it a count guard rather than a plain write, so it must stay in the `where` even though the guard already resolved the row. In concurrent refreshes only one request affects the row (count 1); the others get count 0 and are denied. One statement, no transaction: there is a single row to touch.
- **A replayed refresh token is rejected but does not kill the live session.** Full reuse-detection would delete the session on replay, on the theory that a stale token in flight means a leak. That is deliberately not done here: the far more common cause is the app retrying a request whose response was lost, and punishing it would log a working delivery person out mid-shift. The exposure it buys is bounded by one session per person, the refresh window as a ceiling, and the admin's revoke endpoint (which wipes the password along with the session) as the real answer to a suspected leak — so lengthening that window widens this exposure, and it is the trade to weigh if it grows much further. Revisit this only together with a way to tell a retry from an attack.
- **Refresh re-checks `isActive`** — in the guard, alongside the expiry check. A delivery person deactivated mid-session cannot refresh their way forward, independent of the session row being deleted.
- **Failed-attempt lockout, per IP.** Only *failed* logins increment the counter, through the injected `ThrottlerStorage` under the key `delivery-person-login:<ip>` and the throttler name `"delivery-person"` — its own bucket, never shared with the admin one. Over the limit throws `AUTH_007` (429). A successful login never increments, so a working crew is never throttled.
  Note the lockout name is deliberately **not** a registered throttler name: this module bypasses the throttler guards and passes the literal name straight to the storage, so it must not be added to the canonical name lists in the throttle decorator.

---

## Response DTO

`DeliveryPersonsAuthDto` exposes `accessToken` and `refreshToken`, applied at class level. Both endpoints return the same two fields, so — unlike the customer `AuthDto` with its all-optional fields — nothing here is optional.

**The lifetimes are deliberately not in the response.** The tokens are opaque, so the app cannot read an expiry from them either: it does not track one at all, it reacts to the 401 `DELIVERY_PERSONS_AUTH_003` by refreshing. Do not add `accessTokenExpiresIn` / `refreshTokenExpiresIn` back — the expiration times live only in server config and in the session row.

---

## Conventions

| Rule | Detail |
|---|---|
| Public routes only | Both endpoints are `@Public()` — the marker only bypasses the global device-id guard. Anything requiring an *access* token belongs in a sibling module |
| Bearer tokens come from the header, via a guard | The refresh route takes its token in `Authorization: Bearer`, extracted and validated by `DeliveryPersonRefreshTokenGuard`; never parse an auth header inside a controller or service |
| Tokens are opaque | 32 random bytes via the shared opaque-token helper; only the sha256 hash is persisted |
| Single session per person | Always upsert on `deliveryPersonId`; never create a second session row |
| Same error for every login failure | `INVALID_CREDENTIALS` for all four causes — the *body* never distinguishes them, even though the *timing* can |
| Rotate with a count guard | Never read-then-write a refresh token — a concurrent request would slip through |
| Only failures count against the lockout | A successful login must not increment the throttler storage |
