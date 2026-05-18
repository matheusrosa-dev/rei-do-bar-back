# AGENTS.md — src/me/

## What belongs here

Operations that a **logged-in customer** performs on their own account:
- Fetching their profile (`GET /me`)
- Updating their name (`PATCH /me`)
- Managing their addresses (`POST /me/address`, `DELETE /me/address/:addressId`)

## What does NOT belong here

- Admin operations on customers
- Anonymous customer management → `src/auth/`
- Customer creation → `src/customers/`

---

## Auth Requirement

The entire controller is protected by `@UseGuards(AccessTokenGuard)`. There is no `@Public()` route in this module. All service methods receive `customerId` extracted from `ICurrentSession` by `@CurrentSession()`.

---

## File Structure

```
me/
├── me.module.ts
├── me.service.ts
├── me.controller.ts
├── dtos/
│   ├── index.ts
│   ├── me.dto.ts            # Response DTO (profile + addresses)
│   ├── update-me.dto.ts     # { name?: string } — all fields optional
│   ├── add-address.dto.ts   # Full address fields
│   └── remove-address.dto.ts # { addressId: UUID } — from @Param()
└── __tests__/               # (empty)
```

---

## Central Pattern

All service methods call `findMeOrThrow(customerId)` as the first step to verify the customer exists. The private helper accepts `{ withAddress?: boolean }` to optionally include addresses in the query.

### Address Management

Addresses are managed via nested Prisma writes on `customer.addresses`. Key behaviors:

**Add address**: Wrapped in a `$transaction`:
1. `updateMany` sets all existing addresses for that customer to `isMain: false`
2. `customer.update` with `addresses: { create: ... }` adds the new address as `isMain: true`

The newly added address **always becomes the main address**, demoting all others.

**Remove address**: Uses `addresses: { delete: { id: dto.addressId } }` nested delete. No rebalancing of `isMain` occurs on removal.

**Duplicate check**: Before adding, `MeService` checks in memory if an address with the same `zipCode + number` already exists in the customer's address list.

### UpdateMe

`UpdateMeDto.name` is trimmed with `@Transform(({ value }) => value?.trim())` before validation. Validation requires a space in the name (`@Contains(" ")` — first and last name required). Throws `ME_002` if the DTO is empty (no fields to update).

---

## DTOs

### `MeDto` (response)

```typescript
class MeDto {
  @Expose() id: string;
  @Expose() name: string | null;
  @Expose() phone: string;
  @Expose() createdAt: Date;
  @Expose() @Type(() => AddressDto) addresses?: AddressDto[];
}
```

`@Type(() => AddressDto)` is required for nested class transformation.

### `AddAddressDto` (input)

`zipCode` is validated as exactly 8 digits (`@Length(8, 8)` + `@Matches(/^\d+$/)`). It is stored as a plain string, not formatted.

### `RemoveAddressDto`

`addressId` comes from `@Param()` route parameter — validated as `@IsUUID()`.

---

## Error Codes

| Code | When |
|---|---|
| `ME_001` `CUSTOMER_NOT_FOUND` | No customer with the given ID |
| `ME_002` `NO_FIELDS_TO_UPDATE` | PATCH body has no recognized fields |
| `ME_003` `ADDRESS_ALREADY_EXISTS` | Same `zipCode + number` already in customer's addresses |
| `ME_004` `ADDRESS_NOT_FOUND` | `addressId` not in customer's address list |
