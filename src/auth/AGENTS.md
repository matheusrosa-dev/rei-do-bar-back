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
2. **OTP issuance** — clears any previous codes for the anonymous customer and stores a new hashed code (the plaintext is logged to the console; SMS is not integrated). Returns no content.
3. **OTP login** — validates the submitted code, finds or creates the customer for the phone number, migrates the anonymous cart to the customer, and returns a token pair.
4. **Token refresh** — validated by the refresh-token guard (a separate Passport strategy), rotates the stored token, and returns a new pair.

The anonymous-to-customer migration is delegated to the internal customers service and runs in a single transaction (create customer, reassign the cart, delete the anonymous record).

---

## Central Patterns

- **Token pair**: both tokens are signed directly with the JWT library (not through Passport), carrying the same minimal payload. The refresh token is stored **hashed**, never in plaintext, and rotation (delete old + create new) happens inside one transaction.
- **OTP**: short alphanumeric codes generated with the crypto helper and stored **hashed**; validation re-hashes the incoming code and compares.
- **Passport strategies**: two structurally identical strategies differ only by their secret and registered strategy name (access vs refresh). Both extract the bearer token from the `Authorization` header, and `validate()` returns the decoded payload without an extra database lookup.
- **Response DTO**: a single serialization DTO with all-optional exposed fields covers every endpoint, so each route returns only the relevant subset.

---

## Conventions

| Rule | Detail |
|---|---|
| Only the device-id sync route is public | Every other auth route requires the `x-device-id` header |
| Secrets via injected config | Auth config is read once through `ConfigService` and stored on the service |
| Sensitive values are always hashed | OTP codes and refresh tokens are never persisted in plaintext |
| Refresh uses its own guard | The refresh route activates the refresh strategy explicitly, not the default access strategy |
