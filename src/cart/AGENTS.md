# AGENTS.md — src/cart/

## What belongs here

All cart operations for both anonymous and authenticated customers:
- Fetching cart contents.
- Adding, removing, incrementing, and decrementing products.
- Cart formatting (subtotal, delivery fee, total, product count).

## What does NOT belong here

- Cart creation — carts are created automatically alongside the anonymous customer (at device-id sync) or the customer (via the cart migration on first login).
- Authoritative product stock — that lives in the products domain.
- Delivery-fee configuration — the fee value is read from settings.

---

## The Anonymous/Customer Duality

Every cart operation resolves the owner from the current session, which carries **either** an anonymous device id **or** an authenticated customer id — never both. A single private resolver encapsulates this branching (anonymous lookup by device id vs. active-customer lookup by id) and always loads the cart with its items and their products. It throws a domain error when the owner or cart is missing.

---

## Central Pattern: Cart Operations

Every mutating operation follows the same shape:

1. Resolve the owner and load the cart with items.
2. Validate business rules (product exists/active, already-in-cart, stock availability).
3. Apply a single nested Prisma write on the cart, selecting back the items with their products.
4. Return the formatted cart.

**Formatting** reads the delivery fee from settings (set to zero when the cart is empty), converts cents to currency at presentation time, returns item-level totals (unit price × quantity) rather than unit prices, and exposes remaining stock per item.

**Decrement edge case**: decrementing an item whose quantity is 1 removes it from the cart rather than setting quantity to zero.

---

## DTOs

Action DTOs all share the same single-field shape and are read from the **route param**, not the request body. The response DTO is applied at the controller class level and exposes the cart summary plus an array of item objects.

---

## Conventions

| Rule | Detail |
|---|---|
| Owner resolution | Always via the shared private resolver; never branch on session inline in each method |
| Input source | Action DTOs validate the route param |
| Monetary values | Stored/handled in cents; divided only when formatting the response |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
