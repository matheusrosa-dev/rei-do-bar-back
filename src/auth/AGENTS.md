# AGENTS.md — src/auth/

## What belongs here

Everything related to identity and session lifecycle:
- Phone-based OTP login flow.
- JWT access/refresh token issuance and rotation.
- Anonymous session bootstrap (device-id synchronization).
- Passport.js JWT strategies.

## What does NOT belong here

- Customer profile management → the authenticated customer module.
- Customer record creation logic → the internal customers service.
- Guard implementations → the shared guards directory.

---

## Auth Flow (stages)

1. **Device-id sync** — the only public auth step; creates an anonymous customer and its cart, returning a device id used as the anonymous session key.
2. **OTP issuance** — clears any previous codes for the anonymous customer and stores a new hashed code, both inside a single transaction (the plaintext is logged to the console; SMS is not integrated). Returns no content.
3. **OTP login** — validates the submitted code, finds or creates the customer for the phone number, hands the anonymous cart over to the customer, and returns a token pair. If customer creation races with a concurrent login for the same phone number, the resulting unique-constraint conflict is recovered by re-fetching the existing customer instead of failing.
4. **Token refresh** — validated by the refresh-token guard (a separate Passport strategy), rotates the stored token, and returns a new pair.
5. **Logout** — also guarded by the refresh-token guard (it consumes a refresh token, not an access token). Deletes the presented refresh token and, beyond session teardown, **revokes every push token registered for the device**, so a logged-out device stops receiving notifications. Returns no content.

The cart handover is delegated to the internal customers service and takes **two different paths** (see `src/customers/AGENTS.md`):

- **New customer** → create the customer, reassign the anonymous cart to them, delete the anonymous record — all in one transaction.
- **Existing customer** → the customer's **persisted cart is deleted** and replaced by the device's anonymous cart. This is a *replace*, not a merge: whatever the customer had saved from a previous session is discarded in favor of what is on the device right now.

---

## Central Patterns

- **Token pair**: both tokens are signed directly with the JWT library (not through Passport), carrying the same minimal payload. The refresh token is stored **hashed**, never in plaintext, and rotation (delete old + create new) happens inside one transaction. The delete is **count-guarded**: if it removes zero rows, the token was already rotated by a concurrent request and the refresh is rejected — so a replayed refresh token can never mint a new pair.
- **OTP**: short alphanumeric codes generated with the crypto helper and stored **hashed**. Validation does not fetch-and-compare — it **consumes** the code with a single conditional delete matching (anonymous customer, hashed code, not yet expired). Zero rows deleted means invalid or expired. Doing it as one atomic write is what makes a code single-use even under concurrent attempts, and it enforces expiry in the same statement.
- **Passport strategies**: two structurally identical strategies differ only by their secret and registered strategy name (access vs refresh). Both extract the bearer token from the `Authorization` header, and `validate()` returns the decoded payload without an extra database lookup.
- **Response DTO**: a single serialization DTO with all-optional exposed fields covers every endpoint, so each route returns only the relevant subset.

---

## Conventions

| Rule | Detail |
|---|---|
| Only the device-id sync route is public | Every other auth route requires the `x-device-id` header |
| Auth routes are rate-limited | OTP send/login are throttled per device-id and the public device-id sync per IP, via the shared throttler guards (implementations live in the shared guards directory) |
| Secrets via injected config | Auth config is read once through `ConfigService` and stored on the service |
| Sensitive values are always hashed | OTP codes and refresh tokens are never persisted in plaintext |
| Refresh tokens use their own guard | The refresh and logout routes activate the refresh strategy explicitly, not the default access strategy |
| Single-use secrets are consumed atomically | Validate an OTP or rotate a refresh token with a count-guarded conditional delete — never read-then-write, which a concurrent request can slip through |
