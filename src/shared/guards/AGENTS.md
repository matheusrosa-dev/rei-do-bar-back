# AGENTS.md — src/shared/guards/

## Guard Chain

Three guards are used in this project. **Only `DeviceIdGuard` is global** (registered as `APP_GUARD` in `AppModule`). The other two are applied per-controller or per-route.

```
Every request
    └── DeviceIdGuard (global)
            ├── @Public() → pass through
            └── validate x-device-id header is a valid UUID
                    └── AccessTokenGuard (per-controller/route, e.g. MeController)
                            ├── @Public() → pass through
                            └── validate Bearer JWT (Passport "jwt" strategy)
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

---

## The `@Public()` Decorator

Defined in `src/shared/decorators/public.decorator.ts`:

```typescript
export const Public = () => SetMetadata("isPublic", true);
```

Both `DeviceIdGuard` and `AccessTokenGuard` read this metadata via `Reflector.getAllAndOverride("isPublic", [handler, class])`. **Currently only `POST /auth/sync-device-id` uses `@Public()`**.

---

## Conventions

| Rule | Detail |
|---|---|
| Global guard via `APP_GUARD` | `DeviceIdGuard` only; never register `AccessTokenGuard` globally |
| `@UseGuards` order | NestJS executes guards in the order they are declared |
| Never throw in guards | Return `false` to deny; NestJS converts it to 403 automatically |
| `Reflector` always injected | Both `DeviceIdGuard` and `AccessTokenGuard` require `Reflector` in constructor |
