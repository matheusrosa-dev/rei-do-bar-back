# AGENTS.md — src/shared/guards/

## Guard Chain

Four guards are used in this project. **Only `DeviceIdGuard` is global** (registered as `APP_GUARD` in `AppModule`). The others are applied per-controller or per-route.

```
Every request
    └── DeviceIdGuard (global)
            ├── @Public() → pass through (also bypasses DeviceIdGuard for admin routes)
            └── validate x-device-id header is a valid UUID
                    └── AccessTokenGuard (per-controller/route, e.g. MeController, OrdersController)
                            ├── @Public() → pass through
                            └── validate Bearer JWT (Passport "jwt" strategy)

Admin requests
    └── DeviceIdGuard (global) → @Public() → pass through
            └── BasicAuthGuard (per-controller via @AdminAuth())
                    └── validate HTTP Basic Auth credentials against ADMIN_USERNAME/ADMIN_PASSWORD
```

`RefreshTokenGuard` is only used on `POST /auth/refresh` via `@UseGuards(RefreshTokenGuard)`.

---

## Guard Details

### `DeviceIdGuard`

- Reads `x-device-id` from request headers
- Validates it is a string matching the UUID v1-v5 regex
- Routes decorated with `@Public()` bypass this guard entirely
- **Does not** populate `req.user` — it only gates access

### `AccessTokenGuard`

- Extends `AuthGuard("jwt")` from `@nestjs/passport`
- When active, triggers `AccessTokenStrategy.validate()` which returns the JWT payload into `req.user`
- Routes decorated with `@Public()` bypass this guard via `Reflector` metadata check
- Used at class level on `MeController` — all `/me` routes require a valid access token

### `RefreshTokenGuard`

- Extends `AuthGuard("jwt-refresh")` from `@nestjs/passport`
- Validates with `RefreshTokenStrategy` (uses the separate `jwtRefreshSecret`)
- Applied only to `POST /auth/refresh` via explicit `@UseGuards(RefreshTokenGuard)` on the method
- Does **not** check `@Public()` metadata (not needed — refresh is always authenticated)

### `BasicAuthGuard`

- Implements `CanActivate` directly (not Passport-based)
- Reads credentials from the `Authorization: Basic <base64>` header
- Validates against `admin.username` and `admin.password` from config namespace `"admin"` (`ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars)
- Never applied globally — used exclusively via the `@AdminAuth()` composite decorator on admin controllers

---

## The `@Public()` Decorator

Defined in `src/shared/decorators/public.decorator.ts`:

```typescript
export const Public = () => SetMetadata("isPublic", true);
```

Both `DeviceIdGuard` and `AccessTokenGuard` read this metadata via `Reflector.getAllAndOverride("isPublic", [handler, class])`. Used on `POST /auth/sync-device-id` and implicitly on all admin controllers (via `@AdminAuth()`).

## The `@AdminAuth()` Decorator

A composite decorator defined in `src/shared/decorators/admin-auth.decorator.ts`:

```typescript
export const AdminAuth = () => applyDecorators(Public(), UseGuards(BasicAuthGuard));
```

Applied at **class level** on all admin controllers. It marks the routes as `@Public()` (bypasses `DeviceIdGuard` and `AccessTokenGuard`) and then enforces `BasicAuthGuard`. Admin routes are therefore accessible without an `x-device-id` header and do not use JWT.

---

## Conventions

| Rule | Detail |
|---|---|
| Global guard via `APP_GUARD` | `DeviceIdGuard` only; never register `AccessTokenGuard` globally |
| `@UseGuards` order | NestJS executes guards in the order they are declared |
| Never throw in guards | Return `false` to deny; NestJS converts it to 403 automatically |
| `Reflector` always injected | Both `DeviceIdGuard` and `AccessTokenGuard` require `Reflector` in constructor |
| `BasicAuthGuard` never global | Applied only via `@AdminAuth()` — never register it as `APP_GUARD` |
