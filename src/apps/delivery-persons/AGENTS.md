# AGENTS.md — src/apps/delivery-persons/

## What belongs here

The delivery-person-facing surface of the API — what an entregador consumes from the delivery app while working. It is a **container module only**: it owns no controller or service of its own, just the sub-modules it registers (`auth/` and `orders/`), mirroring how `src/apps/admin/` is organized.

## What does NOT belong here

- Delivery-person CRUD (create, update, activate, delete), **password assignment**, and **access revocation** → `src/apps/admin/delivery-persons/`.
- Delivery-person assignment and every order status transition **except the delivery confirmation** → `src/apps/admin/orders/`. Confirming a delivery (`SHIPPED → DELIVERED`) is the one write the entregador owns, and it lives in `orders/`.
- Customer order placement, listing, and cancellation → `src/apps/store/orders/`.
- Customer authentication (OTP + JWT) → `src/apps/store/auth/`. The two flows share nothing but the shared helpers; do not merge them.

---

## Core Patterns

- **One sub-module per domain**, each with its own module/controller/service and `dtos/`, registered in `delivery-persons.module.ts`. The container module declares no providers.
- **Class names are prefixed with `DeliveryPersons`** (`DeliveryPersonsAuthController`, `DeliveryPersonsOrdersService`) so they never collide with the customer-facing or admin classes of the same domain, exactly as the admin sub-modules use the `Admin` prefix.
- **Route prefix**: every controller here lives under `delivery-persons/`, one segment per sub-module (`delivery-persons/auth/`, `delivery-persons/orders/`) — the path **never carries a delivery-person id**, because the token already names the entregador. An id of another resource is fine when the route needs one (`delivery-persons/orders/:orderId/deliver`), and the query is still scoped by the id from the token.

---

## Authentication

The delivery app authenticates with **opaque bearer tokens** issued by `auth/`, not with the credential itself. The delivery person posts their **CPF and password** once; from then on the app carries an access token.

- **Opaque, not JWT**: both tokens are 32 random bytes, base64url-encoded, carrying no payload. The server is the only thing that can resolve one to an identity — which is precisely what makes instant revocation possible, and why a stolen token cannot be read or forged offline. Do not swap them for JWTs: a self-validating token would defeat revocation.
- **Only the hash is stored** (`hashString`, sha256). sha256 is correct here and bcrypt is not: the token is high-entropy random, not a human password, so there is nothing to slow an attacker down against — the password helper stays for the *login* credential only.
- **One session per delivery person**: `delivery_person_sessions.delivery_person_id` is `@unique`, so a login `upsert` **replaces** the previous session. Logging in on a second device silently drops the first. That is the intended contract — one access token and one refresh token per person at any moment.
- **Lifetimes** come from the `auth` config namespace (see the root env table for the current values) and stay server-side — they are **not** returned by login or refresh. The app holds opaque tokens with no `exp` to read and does not track expiry: it refreshes when a request comes back 401 `DELIVERY_PERSONS_AUTH_003`. The access token is short and the refresh is **sliding**: every refresh issues a fresh pair and restarts both clocks, so idling past the refresh window ends the session while an active shift never gets interrupted.
- **Rotation is single-use**: refreshing swaps both hashes in one count-guarded conditional update. A replayed refresh token matches nothing and is rejected.
- **Both tokens travel in `Authorization: Bearer`**, each validated by its own guard before the handler runs — the access token on every protected controller, the refresh token on the one refresh route. No token is ever read from a request body.
- **No logout endpoint** (deliberate, for now): a session ends by expiring or by admin revocation. Adding one means deleting the session row, not inventing a second mechanism.

Every controller outside `auth/` is gated by the delivery-person auth composite at class level, which marks the route public (bypassing the global device-id guard — the delivery app sends no `x-device-id`) and applies the access-token guard. Inside `auth/`, only the refresh route is guarded, by the refresh-token guard applied directly on the handler. See `src/shared/guards/AGENTS.md`.

**The token is the identity.** Handlers read the delivery person from `@CurrentDeliveryPerson()`, never from a route param or the body. Keep scoping every query by that id anyway — defense in depth, and it keeps identity a guard concern rather than a service one.

A delivery person with **no password set cannot log in at all**, and neither can an inactive one. Deactivating someone clears the stored password hash, deletes their session, and makes the guard reject any token that survives — a complete cut-off that reactivation alone does not undo — activation clears the hash as well, so the admin reactivates first and assigns a new password after. The admin can also revoke access on its own, without touching the active flag: revocation performs the same credential wipe, so a revoked delivery person stays active yet unable to log in until a new password is assigned (see `src/apps/admin/delivery-persons/AGENTS.md`).
