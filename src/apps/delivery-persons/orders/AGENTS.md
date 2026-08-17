# AGENTS.md — src/apps/delivery-persons/orders/

## What belongs here

The orders a delivery person sees while working: currently a single read — the orders **out for delivery** (status `SHIPPED`) assigned to a given delivery person.

## What does NOT belong here

- Assigning or reassigning a delivery person to an order → `src/apps/admin/orders/` (assignment happens on the transition to `SHIPPED`).
- Moving an order to `DELIVERED` → `src/apps/admin/orders/`, through the status state machine.
- Customer order placement, listing, and cancellation → `src/apps/store/orders/`.

---

## Core Patterns

- **Endpoint**: `GET delivery-persons/orders`. The delivery person comes from the **access token**, read through `@CurrentDeliveryPerson()` — there is no id in the path and no params DTO. See the parent `AGENTS.md`.
- **Filter**: `deliveryPersonId` **and** `status = SHIPPED`. No other status is exposed here; a delivered or cancelled order drops out of the list on its own once the admin transitions it.
- **Order**: oldest first (`createdAt asc`) — the list is a delivery queue, not an archive, so the opposite of the customer-facing listing.
- **No not-found error**: a delivery person with no assigned orders yields an empty list rather than an exception. There is no existence check in the service — the guard already resolved the delivery person from a live session — so this module registers no error codes.
- **Totals**: computed with `computeOrderTotals` from `@shared/helpers/products-totals`, spread over the order row — the same helper the customer and admin order surfaces use, so no surface can disagree on a total. Money is always derived from the item **snapshots**, never the live product row.

---

## Response DTO

`DeliveryPersonsOrdersDto` is a **deliberately narrow** subset of the customer order response — only what someone carrying the order to the door needs: the `orderNumber` to call it out, the snapshotted `address` to deliver to, the `total` and `paymentType` to collect the right amount, and the items (id, name, image, quantity, unit price) to check the bag against.

Everything else the service computes is dropped at serialization: the internal `id`, `status` (invariant on this endpoint), `createdAt`, and the whole breakdown that only matters for billing (`deliveryFee`, `productsTotal`, `productsDiscount`, `couponDiscount`, `couponCode`, `statusReason`, `compareAtPrice` on items). Keep this surface at that bar — a field is added here only when the delivery flow actually needs it.

The service still computes the full money shape (`computeOrderTotals` is not partial), so widening the DTO is the only change needed to expose more; the reverse is also true — never drop a field from the service just because the DTO hides it.

---

## Conventions

| Rule | Detail |
|---|---|
| Read-only | This module never writes; order state is the admin's to transition |
| Scope every query by the delivery person | The id from the token is always part of the `where`, never applied after the fetch |
| Totals from the shared helper | Never re-derive the total formula here |
| Empty over error | A delivery person with nothing out for delivery returns `[]`, not a 404 |
