# AGENTS.md — src/customers/

## What belongs here

Internal service layer for `Customer` entity operations that are shared across multiple feature modules. There is **no public HTTP controller** in this module — `CustomersModule` exports `CustomersService` for other modules to import.

## What does NOT belong here

- Anonymous customer logic → `src/auth/`
- Customer self-management (profile, addresses) → `src/me/`
- Any route handler

---

## Module Design

`CustomersModule` exports `CustomersService`. Currently only `AuthModule` imports it.

```typescript
@Module({
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
```

---

## CustomersService

### `createCustomerFromAnonymous`

The only current method. Executed inside a `$transaction`:

1. Creates a new `Customer` with `{ phone, isActive: true }`
2. Updates the anonymous cart: clears `anonymousCustomerId`, sets `customerId` to the new customer
3. Deletes the `AnonymousCustomer` record

```typescript
async createCustomerFromAnonymous(data: {
  newCustomer: { phone: string };
  anonymousCustomer: { cartId: string; id: string };
})
```

The cart migration (`anonymousCustomerId → null`, `customerId → newCustomer.id`) is the critical step that preserves the user's cart across the login boundary. All three operations are atomic.
