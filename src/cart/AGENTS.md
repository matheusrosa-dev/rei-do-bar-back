# AGENTS.md — src/cart/

## What belongs here

All cart operations for both anonymous and authenticated customers:
- Fetching cart contents
- Adding, removing, incrementing, decrementing products
- Cart formatting (subtotal, delivery fee, total)

## What does NOT belong here

- Cart creation — carts are created automatically alongside `AnonymousCustomer` (in `AuthService.syncDeviceId`) or alongside `Customer` (implicitly via the cart migration in `CustomersService`)
- Product stock validation beyond cart context (authoritative stock is in `products`)
- Delivery fee configuration — the fee value lives in the `settings` table (`SettingKey.DELIVERY_FEE`)

---

## File Structure

```
cart/
├── cart.module.ts
├── cart.service.ts
├── cart.controller.ts
├── dtos/
│   ├── index.ts
│   ├── cart.dto.ts                      # Response DTO
│   ├── add-to-cart.ts                   # { productId: UUID } — used for add AND as base
│   ├── increment-product-quantity.ts    # Same shape as AddToCartDto (UUID productId)
│   ├── decrement-product-quantity.ts    # Same shape as AddToCartDto
│   └── remove-from-cart.ts             # Same shape as AddToCartDto
└── __tests__/
    └── cart.service.spec.ts
```

---

## The Anonymous/Customer Duality

Every cart operation resolves the cart owner from `ICurrentSession`, which contains **either** `deviceId` (anonymous) **or** `customerId` (authenticated) — never both. The private method `findAnonymousOrCustomerWithCartOrThrow` encapsulates this branching:

```typescript
// If session.deviceId → query anonymousCustomer WHERE deviceId = ...
// If session.customerId → query customer WHERE id = ... AND isActive = true
// Always includes: cart → items → product
```

Throws `AppException` with appropriate cart error codes if the customer or their cart doesn't exist.

---

## Central Pattern: Cart Operations

All mutating operations follow this exact structure:

1. Call `findAnonymousOrCustomerWithCartOrThrow(session)` to load cart with items
2. Validate business rules (product exists/in cart, stock check)
3. Call `prisma.cart.update()` with nested write, returning items with products
4. Return `this.formatCart(updatedItems)`

```typescript
async addToCart(session: ICurrentSession, dto: AddToCartDto) {
  const customerOrAnonymous = await this.findAnonymousOrCustomerWithCartOrThrow(session);

  // business validation...

  const updatedCart = await this.prisma.cart.update({
    where: { id: customerOrAnonymous.cart.id },
    data: { items: { create: { productId: product.id, quantity: 1 } } },
    select: { items: { include: { product: true } } },
  });

  return this.formatCart(updatedCart.items);
}
```

### `formatCart` (private async)

Fetches `DELIVERY_FEE` from `settings` table, then builds the response object. Key behaviors:
- Delivery fee is set to `0` when cart is empty
- `deliveryFee` in the DB is stored in cents as a string (e.g. `"200"`) — divided by 100 for display
- `price` in the response is `product.price * quantity` (item-level total, not unit price)
- `remainingStock` is returned on cart items (full value, unlike the product listing which caps at 10)

### Decrement Edge Case

When `quantity === 1` and decrement is called, the item is **deleted** from the cart (not set to 0). This is a `deleteMany({ productId })` nested write.

---

## DTOs

### Input (validation)

All action DTOs have the same shape: `{ productId: UUID }`. They are extracted from **route params** (`@Param()`), not from the request body.

```typescript
// Route: POST /cart/product/:productId
@Post("product/:productId")
async addToCart(@CurrentSession() session, @Param() dto: AddToCartDto) { ... }
```

### Response (`CartDto`)

`@Serialize(CartDto)` is applied at the controller class level. The DTO exposes top-level cart summary fields (`subtotal`, `deliveryFee`, `total`, `productsCount`) plus a `products` array of `CartItemDto` objects.

---

## Error Codes

All thrown via `AppException` with codes from `AppException.errorCodes.cart`:

| Code | When |
|---|---|
| `CART_001` `PRODUCT_NOT_FOUND` | Product ID does not exist or is inactive |
| `CART_002` `PRODUCT_ALREADY_IN_CART` | Attempt to add a product that's already in the cart |
| `CART_003` `ANONYMOUS_CUSTOMER_NOT_FOUND` | No AnonymousCustomer for the given deviceId |
| `CART_004` `CART_NOT_FOUND` | Customer exists but has no cart |
| `CART_005` `PRODUCT_NOT_FOUND_IN_CART` | Attempt to modify/remove a product not in cart |
| `CART_006` `PRODUCT_OUT_OF_STOCK` | Add/increment would exceed available stock |
| `CART_007` `CUSTOMER_NOT_FOUND` | No active Customer for the given customerId |
