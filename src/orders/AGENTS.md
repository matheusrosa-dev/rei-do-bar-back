# AGENTS.md — src/orders/

## What belongs here

Order lifecycle for authenticated customers:
- Creating an order from the current cart
- Listing all past and current orders
- Cancelling an order

## What does NOT belong here

- Cart management → `src/cart/`
- Admin order management (not yet implemented)

---

## Auth Requirement

The entire controller is protected by `@UseGuards(AccessTokenGuard)`. All endpoints require a valid Bearer JWT. `customerId` is extracted from `ICurrentSession` via `@CurrentSession()`.

---

## Endpoints

All routes are under `@Controller("orders")`. `@Serialize(OrdersDto)` is applied at class level.

| Method | Path | Description |
|---|---|---|
| `POST` | `/orders` | Create an order from the current cart |
| `GET` | `/orders` | List all orders for the authenticated customer |
| `PUT` | `/orders/:orderId/cancel` | Cancel an order |

All three endpoints return the full updated order list (not just the affected order).

---

## File Structure

```
orders/
├── orders.module.ts
├── orders.service.ts
├── orders.controller.ts
├── dtos/
│   ├── index.ts
│   ├── create-order.dto.ts     # { paymentType: PaymentType }
│   ├── cancel-order.dto.ts     # { orderId: UUID } — from @Param()
│   └── orders.dto.ts           # Response DTO
└── __tests__/
    └── orders.service.spec.ts
```

---

## Create Order Flow

### Pre-transaction Validations

1. Customer must exist and be active
2. Customer must have a `name` set — checked by `checkIfCustomerIsAptToCreateOrder` (throws `CUSTOMER_NOT_INITIALIZED`)
3. Cart cannot be empty — same helper (throws `CART_EMPTY`)
4. All cart items must have sufficient stock and be active/not-deleted — `checkIfThereAreInvalidItemsInCart` (throws `PRODUCT_INACTIVE` or `PRODUCTS_OUT_OF_STOCK`)
5. Customer must have at least one address with `isMain: true` (throws `NO_MAIN_ADDRESS`)
6. Delivery fee is fetched from `SettingsService` before entering the transaction

### Inside `$transaction` — Concurrent Order Guard

```typescript
await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`
```

This row-level lock on the customer row serializes concurrent `createOrder` calls for the same customer, preventing two orders from being created simultaneously. After acquiring the lock:

7. Count ongoing orders (status not in `[CANCELLED, DELIVERED]`); if any exist, throw `ONGOING_ORDER`
8. Create the order with items (snapshotting `name`, `price`, `imageUrl` from current product data at time of purchase)
9. Decrement stock for each item atomically (`updateMany WHERE stock >= quantity`); if `count === 0`, throw `PRODUCTS_OUT_OF_STOCK`
10. Clear the cart (`deleteMany` on cart items)

### Address Snapshot

The delivery address is stored as a formatted string at order creation time:

```
"{street}, {number} - {neighborhood}/{zipCode}"
```

This is immutable — subsequent changes to the customer's addresses do not affect past orders.

---

## Cancel Order Flow

1. Fetch order by `orderId` filtered by `customerId` (ownership check); throw `ORDER_NOT_FOUND` if absent
2. Inside `$transaction`:
   - `updateMany WHERE status IN [PENDING, PREPARING]` → `CANCELLED`; if `count === 0`, throw `ORDER_NOT_CANCELLABLE` (order has progressed past a cancellable state)
   - Restore stock for each order item (`update stock += quantity`)

---

## Response DTO (`OrdersDto`)

Each order in the list includes computed fields added by `findAndFormatOrders`:

| Field | Source |
|---|---|
| `id`, `orderNumber`, `address`, `status`, `statusReason` | DB |
| `deliveryFee`, `paymentType`, `createdAt` | DB |
| `subtotal` | Computed: `sum(item.price * item.quantity)` |
| `total` | Computed: `subtotal + deliveryFee` |
| `items` | `OrderItemDto[]` — `id`, `name`, `imageUrl`, `quantity`, `price` |

---

## Error Codes

| Constant | Code | HTTP | When |
|---|---|---|---|
| `CUSTOMER_NOT_FOUND` | `ORDER_001` | 404 | Customer not found or inactive |
| `CUSTOMER_NOT_INITIALIZED` | `ORDER_002` | 400 | Customer has no `name` set |
| `CART_EMPTY` | `ORDER_003` | 400 | Cart has no items |
| `ONGOING_ORDER` | `ORDER_004` | 400 | Customer already has a non-terminal order |
| `PRODUCTS_OUT_OF_STOCK` | `ORDER_005` | 400 | Item in cart exceeds available stock |
| `PRODUCT_INACTIVE` | `ORDER_006` | 400 | Item in cart is inactive or soft-deleted |
| `ORDER_NOT_FOUND` | `ORDER_007` | 404 | Order not found or belongs to another customer |
| `ORDER_NOT_CANCELLABLE` | `ORDER_008` | 400 | Order status is not `PENDING` or `PREPARING` |
| `NO_MAIN_ADDRESS` | `ORDER_009` | 400 | Customer has no address with `isMain: true` |
