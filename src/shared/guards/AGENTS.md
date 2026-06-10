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

Admin request
  └── device-id guard (global) → public → pass through
        └── basic-auth guard (per controller, via the admin-auth composite)
              └── validate HTTP Basic Auth credentials
```

The refresh-token guard is applied only on the token-refresh route.

---

## Guard Roles

- **Device-id guard**: reads the `x-device-id` header and validates it as a UUID; public routes bypass it; it only gates access and does not populate the request user.
- **Access-token guard**: extends the Passport JWT guard, triggering the access strategy that places the decoded payload on the request; respects the public marker via the reflector.
- **Refresh-token guard**: extends the Passport JWT guard with the separate refresh strategy/secret; used exclusively on the refresh route.
- **Basic-auth guard**: implements the guard interface directly (not Passport-based), validating credentials from the `Authorization: Basic` header against the admin config namespace; never registered globally.

---

## Public & Admin-Auth Decorators

The public marker sets route metadata that both the device-id and access-token guards read via the reflector. The admin-auth composite combines the public marker with the basic-auth guard and is applied at controller class level on admin controllers — so admin routes skip device-id/JWT and are gated solely by Basic Auth.

---

## Conventions

| Rule | Detail |
|---|---|
| Single global guard | Only the device-id guard is registered globally |
| Per-scope auth | Access-token and basic-auth guards are applied per controller/route, never globally |
| Never throw in guards | Deny by returning false; the framework maps it to a forbidden response |
| Reflector for metadata | Guards that honor the public marker inject the reflector |
