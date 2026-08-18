# AGENTS.md — src/apps/delivery-persons/orders/

## What belongs here

The orders a delivery person handles while working: the read of the orders **out for delivery** (status `SHIPPED`) assigned to them, and the single write they own — confirming that one of those orders was **delivered**.

## What does NOT belong here

- Assigning or reassigning a delivery person to an order → `src/apps/admin/orders/` (assignment happens on the transition to `SHIPPED`).
- Every other status transition — `PREPARING`, `SHIPPED`, `CANCELLED` → `src/apps/admin/orders/`, through the status state machine. The delivery person owns exactly one arrow of that machine, `SHIPPED → DELIVERED`, and cannot cancel.
- Customer order placement, listing, and cancellation → `src/apps/store/orders/`.

---

## Core Patterns

- **Endpoints**: `GET delivery-persons/orders` and `PATCH delivery-persons/orders/:orderId/deliver`. The delivery person always comes from the **access token**, read through `@CurrentDeliveryPerson()` — the only id ever accepted from the client is the **order** id, never a delivery-person id. See the parent `AGENTS.md`.
- **Filter**: `deliveryPersonId` **and** `status = SHIPPED`. No other status is exposed here; a delivered or cancelled order drops out of the list on its own.
- **Order**: oldest first (`createdAt asc`) — the list is a delivery queue, not an archive, so the opposite of the customer-facing listing.
- **Scope every query by the delivery person.** Both the read and the write carry `deliveryPersonId` in the `where`, and the write carries it **twice** — on the lookup and again on the update. Dropping it from either one would let a delivery person finish someone else's order.
- **Totals**: computed with `computeOrderTotals` from `@shared/helpers/products-totals`, spread over the order row — the same helper the customer and admin order surfaces use, so no surface can disagree on a total. Money is always derived from the item **snapshots**, never the live product row.

---

## Marking an order delivered

`PATCH :orderId/deliver` is a **dedicated action route with no body** and answers **204 No Content** — the delivery person has exactly one possible transition, so there is nothing to pick and nothing worth returning. The app refetches the queue.

The flow, in `markOrderAsDelivered`:

1. `findFirst` scoped by `{ id, deliveryPersonId }`. Nothing found → `ORDER_NOT_FOUND` (404). An order that exists but belongs to another delivery person collapses into this same answer, so the endpoint never confirms the existence of an order outside the caller's queue.
2. Status is not `SHIPPED` → `ORDER_NOT_SHIPPED` (400). This covers the already-delivered replay, a cancellation, and an order the admin has not shipped yet.
3. A **count-guarded conditional update** (`where: { id, deliveryPersonId, status: SHIPPED }`), the same pattern as `AdminOrdersService.updateOrderStatus`: a zero-row result means the admin changed the order between the read and the write, and raises `ORDER_NOT_SHIPPED` with a reload message rather than passing silently.
4. `OrderStatusUpdatedEvent` is emitted **after** the write. This is not optional bookkeeping — that event is the *only* thing that triggers the customer's "🎉 Pedido entregue!" push in `src/apps/admin/notifications/`, so a delivery confirmation that skips it silently drops the notification. The `findFirst` row already carries the `customerId`, `orderNumber` and `statusReason` the payload needs.

**No `$transaction`**: a single `updateMany` is already atomic. Unlike the admin's cancellation path, `DELIVERED` touches no stock and no second table.

**The transition map is not reused.** `ORDER_STATUS_TRANSITIONS` lives in `src/apps/admin/orders/helpers.ts`; with a single legal arrow here, the explicit `status !== SHIPPED` check is clearer than importing the admin's map across apps.

---

## Error codes

The write registers its own `deliveryPersonsOrders` namespace — the delivery app is a separate audience, so it does not borrow the admin's or the customer's order codes even where the failure is the same (see `src/shared/exceptions/AGENTS.md`). The values live in the API contract reference; only the constants belong here:

| Constant | Status | When |
|---|---|---|
| `ORDER_NOT_FOUND` | 404 | No order with that id assigned to the caller |
| `ORDER_NOT_SHIPPED` | 400 | The order is not (or is no longer) out for delivery |

The **read** registers no error of its own: a delivery person with nothing assigned yields an empty list, not a 404. There is no existence check on that path — the guard already resolved the delivery person from a live session.

---

## Response DTO

`DeliveryPersonsOrdersDto` is a **deliberately narrow** subset of the customer order response — only what someone carrying the order to the door needs: the `id` to confirm the delivery against, the `orderNumber` to call it out, the snapshotted `address` to deliver to, the `total` and `paymentType` to collect the right amount, and the items (id, name, image, quantity, unit price) to check the bag against.

Everything else the service computes is dropped at serialization: `status` (invariant on the listing), `createdAt`, and the whole breakdown that only matters for billing (`deliveryFee`, `productsTotal`, `productsDiscount`, `couponDiscount`, `couponCode`, `statusReason`, `compareAtPrice` on items). Keep this surface at that bar — a field is added here only when the delivery flow actually needs it.

The service still computes the full money shape (`computeOrderTotals` is not partial), so widening the DTO is the only change needed to expose more; the reverse is also true — never drop a field from the service just because the DTO hides it.

`@Serialize(DeliveryPersonsOrdersDto)` stays at **controller class level**, per `src/shared/interceptors/AGENTS.md`. The 204 handler is unaffected: the serializer maps `undefined` to `undefined` and `WrapperDataInterceptor` passes a falsy body straight through, so a void handler never gains a body — the same arrangement `src/apps/store/auth/` already relies on.

---

## Conventions

| Rule | Detail |
|---|---|
| One write, one arrow | The only state this module changes is `SHIPPED → DELIVERED`; everything else is the admin's |
| Scope every query by the delivery person | The id from the token is always part of the `where`, never applied after the fetch |
| Guard the write on the current status | Conditional `updateMany` + `count === 0` check, never a bare `update` |
| Emit the status event | A transition without `OrderStatusUpdatedEvent` loses the customer's push |
| Totals from the shared helper | Never re-derive the total formula here |
| Empty over error | A delivery person with nothing out for delivery returns `[]`, not a 404 |
