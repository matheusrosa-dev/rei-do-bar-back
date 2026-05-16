# CLAUDE.md — src/auth/

## What belongs here

Everything related to identity and session lifecycle:
- Phone-based OTP login flow
- JWT access token and refresh token issuance/rotation
- Device ID synchronization (anonymous session bootstrap)
- Passport.js JWT strategies

## What does NOT belong here

- Customer profile management → `src/me/`
- Customer record creation logic → `src/customers/` (`CustomersService.createCustomerFromAnonymous`)
- Guard implementations → `src/shared/guards/`

---

## Auth Flow

```
Mobile App                          Backend
    │                                  │
    ├── POST /auth/sync-device-id ─────► Creates AnonymousCustomer + Cart
    │   (Public, no x-device-id)       Returns { deviceId: UUID }
    │                                  │
    ├── POST /auth/send-otp-code ──────► Deletes old OTPs, creates new hashed OTP
    │   x-device-id: <UUID>            Logs code to console (SMS not integrated)
    │                                  │
    ├── POST /auth/login-otp-code ─────► Validates OTP, finds/creates Customer
    │   x-device-id: <UUID>            Migrates cart from anonymous to customer
    │   body: { phone, code }          Returns { accessToken, refreshToken }
    │                                  │
    └── POST /auth/refresh ────────────► Validates refresh token, rotates it
        Authorization: Bearer <token>  Returns new { accessToken, refreshToken }
```

### Anonymous-to-Customer Migration

When a user logs in for the first time, `AuthService` calls `CustomersService.createCustomerFromAnonymous()` which in a single transaction:
1. Creates a new `Customer` record with the phone number
2. Reassigns the anonymous cart (`cart.anonymousCustomerId → null`, `cart.customerId → newCustomer.id`)
3. Deletes the `AnonymousCustomer` record

If the phone already exists, the existing `Customer` is used and the anonymous cart is discarded (the anonymous customer is still deleted at the end of the flow in `CustomersService`).

---

## File Structure

```
auth/
├── auth.module.ts            # Imports CustomersModule
├── auth.service.ts           # All auth business logic
├── auth.controller.ts        # Route handlers
├── dtos/
│   ├── index.ts              # Barrel re-export
│   ├── auth.dto.ts           # Response serialization DTO
│   ├── send-otp-code.dto.ts  # Input: { phone }
│   ├── login-otp-code.dto.ts # Input: { phone, code }
│   └── sync-device-id.dto.ts # Input: { deviceId? }
├── strategies/
│   ├── index.ts              # Barrel re-export
│   ├── access-token.strategy.ts   # Passport "jwt" strategy
│   └── refresh-token.strategy.ts  # Passport "jwt-refresh" strategy
└── __tests__/
    └── auth.service.spec.ts
```

---

## Central Patterns

### JWT Token Pair

Tokens are signed with **`jsonwebtoken` directly** (not via passport) inside `AuthService.generateTokens()`. Both tokens carry the same payload `{ customerId, phone }`. The refresh token is stored **hashed** (SHA-256) in the `refresh_tokens` table — never in plaintext.

```typescript
private generateTokens(payload: { customerId: string; phone: string }) {
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpirationTime });
  const refreshToken = jwt.sign(payload, jwtRefreshSecret, { expiresIn: jwtRefreshExpirationTime });
  const hashedRefreshToken = hashString(refreshToken);

  return { accessToken, refreshToken, hashedRefreshToken };
}
```

Refresh token rotation: on every refresh, the old token is deleted and a new one is created within a single `$transaction`.

### OTP Generation and Storage

OTPs are 6-character alphanumeric strings (`[A-Z0-9]`). Generated with `crypto.getRandomValues` in `src/shared/helpers/otp-code.ts`. Stored **hashed** (SHA-256) in the `otp_codes` table. Validated by hashing the incoming code and comparing.

### Passport Strategies

Both strategies are identical in structure — they differ only in the secret key and the strategy name:

| Strategy class | Passport name | Secret config key |
|---|---|---|
| `AccessTokenStrategy` | `"jwt"` | `authConfig.jwtSecret` |
| `RefreshTokenStrategy` | `"jwt-refresh"` | `authConfig.jwtRefreshSecret` |

Both use `ExtractJwt.fromAuthHeaderAsBearerToken()`. The `validate()` method returns the raw decoded payload (no additional DB lookup).

### Response DTO

`@Serialize(AuthDto)` on the controller strips all fields except `deviceId`, `accessToken`, and `refreshToken`. All three are optional (`@Expose()`) so the same DTO covers all endpoints.

---

## Conventions

| Rule | Detail |
|---|---|
| All endpoints under `@Controller("auth")` | Routes: `/auth/sync-device-id`, `/auth/send-otp-code`, `/auth/login-otp-code`, `/auth/refresh` |
| `sync-device-id` is `@Public()` | Bypasses `DeviceIdGuard` — the only auth endpoint that doesn't require `x-device-id` |
| `send-otp-code` returns 204 | `@HttpCode(HttpStatus.NO_CONTENT)` |
| `refresh` uses `@UseGuards(RefreshTokenGuard)` | Activates `"jwt-refresh"` Passport strategy instead of default `"jwt"` |
| Config accessed via constructor injection | `this.authConfig = configService.get<IAuthConfig>("auth")!` stored as private field |
