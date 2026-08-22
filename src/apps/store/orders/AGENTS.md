# AGENTS.md — src/apps/store/orders/

## What belongs here

The order lifecycle for authenticated customers: creating an order from the current cart, listing orders, and cancelling an order.

## What does NOT belong here

- Cart management → the cart module.
- Admin order listing → the admin orders sub-module.
- Coupon redemption rules (availability, discount calculation, usage reads) → the coupons module; this module imports it and only orchestrates revalidation, usage recording, and reversal.

---

## Auth Requirement

The entire controller carries `@StoreAuth("accessToken")` at class level — device-id then bearer JWT. The authenticated customer id comes from the current session. All endpoints return the customer's full, freshly computed order list rather than just the affected order.

---

## Create Order Flow

**Pre-transaction validations** (fail fast, before any write): the settings map is fetched **first**, and if a store-closed setting is active (on-break or outside business hours) checkout is rejected with that setting's configured message; the customer must exist and be active (both the missing and the inactive case raise the same inactive-customer error); the customer must have a name set; the cart must be non-empty; every cart item must be active, **not soft-deleted**, and have sufficient stock; if the cart carries a coupon it is revalidated before any write — availability (delegated to the coupons service), the cart's **net** products total against the coupon's own minimum order value, the global usage limit, whether the customer has already used it, and the customer's eligibility for the coupon (a restricted coupon with the customer not on the list raises `order.COUPON_NOT_ELIGIBLE`) — and the coupon discount is computed from that same net total; the resulting total (net products total plus delivery fee, coupon discount subtracted) must meet the configured minimum order value (skipped when the setting is absent or zero); the customer must have a main address. The settings and delivery fee are fetched before entering the transaction.

**Inside the transaction** a row-level lock is taken on the customer row (`SELECT ... FOR UPDATE`) to serialize concurrent order creation for the same customer. After the lock: reject if a non-terminal order already exists; create the order with item snapshots (name, price, `compareAtPrice`, image captured at purchase time); decrement stock atomically with a guarded conditional update; when a coupon is applied, record its usage — for coupons with a global usage limit a row-level lock is first taken on the coupon row and usages are re-counted under the lock so concurrent customers cannot exceed it, and the unique (coupon, customer) constraint converts a duplicate-usage race into the domain already-used error; and clear the cart, also detaching the consumed coupon from it.

**Address snapshot**: the delivery address is stored as a formatted immutable string at creation time, so later changes to the customer's addresses never affect past orders.

**Coupon snapshot**: the applied coupon's code and the computed discount (`couponDiscount`) are stored on the order at creation time, so later coupon changes or deletion never affect past orders. The order also keeps a nullable reference to the coupon row (nulled if the coupon is deleted), used to revert the usage exactly on cancellation.

**Welcome coupon**: when the cart carries no real coupon **and** the `WELCOME_COUPON` setting is present in the active settings map, the customer's welcome-coupon discount (see `src/apps/store/coupons/AGENTS.md`) is computed — eligibility query first, then the discount — and folded into `couponDiscount` before the minimum-order check. If the setting is missing or inactive, eligibility is never checked and the order gets no welcome discount. Unlike the cart, order placement always runs against an authenticated `customerId`, so it always resolves eligibility through the query (there is no anonymous shortcut here). Because it isn't backed by a `Coupon` row, the order snapshots `couponId: null` and `couponCode: WELCOME_COUPON_CODE` whenever the customer is **eligible** (`isWelcomeCoupon`), the same condition the cart uses — not gated on the computed discount being non-zero. An eligible customer with an empty-enough cart still gets the coupon code snapshotted on the order with `couponDiscount: 0`, mirroring what they saw in the cart. No `CouponUsage` row is created and cancellation has nothing to revert — eligibility is re-derived from order history, so cancelling the order already restores it.

Eligibility is checked once before the transaction and **re-checked under the customer row lock**, right where the ongoing-order check happens, to close the race with a concurrent order creation. Note what failing that re-check does: the order is **rejected** with the welcome-coupon-unavailable error, not silently repriced without the discount. The customer never gets charged a total they did not see.

---

## Cancel Order Flow

Fetch the order scoped by customer id (ownership check), then in a transaction conditionally transition it to cancelled. The condition is **`status = PENDING`** — that is the only status a customer may cancel; once the kitchen has accepted the order, cancellation is the admin's call. A zero-row result means the order has already moved on, and the request is rejected rather than silently doing nothing. The same guarded update stamps **`cancelledAt`**, the record of when the cancellation happened — `updatedAt` cannot serve as one, since any later write to the row overwrites it. The admin's cancel door stamps the same column (see `src/apps/admin/orders/AGENTS.md`).

The same transaction restores stock for each item (a plain increment — unlike the decrement at creation, there is nothing to guard against) and reverts any coupon usage: the customer's usage row is deleted through the coupon reference snapshotted on the order, making the coupon redeemable again (skipped if the coupon was deleted, since its usages cascade away with it).

---

## Emitted Events

Order creation and cancellation emit lifecycle events through the event emitter rather than calling other modules directly. Listeners elsewhere react to them — order movements are recorded in the inventory ledger and customer push notifications are sent. The cancellation event carries the movement origin so the ledger does not have to infer it. These side effects are fire-and-forget from this module's perspective; the response is the freshly computed order list regardless.

---

## Response DTO

Each order carries DB fields plus computed totals and a nested item collection, read oldest-first and tied on the id. The tiebreaker is load-bearing rather than cosmetic: the items of one order are written by a single `createMany`, so they share a `createdAt` to the millisecond and, with nothing else to separate them, the customer would see the lines of the same order in a different sequence on each read. The money shape **mirrors the cart's** (see `src/apps/store/cart/AGENTS.md`), with one structural difference: everything is derived from the **item snapshots**, never from the live product row — a later price or sale change must not reprice a past order.

| Field | Meaning |
|---|---|
| `productsTotal` | The **gross** total: for each item, the snapshotted `compareAtPrice` when the item was on sale (set and greater than `price`), otherwise `price` — multiplied by `quantity` and summed. The "sticker price" total, for display only |
| `productsDiscount` | The sum, across items, of `(compareAtPrice - price) * quantity` for on-sale items only. `productsTotal - productsDiscount` always equals the real, price-based total |
| `couponDiscount` | The coupon (or welcome-coupon) discount snapshotted at creation — a **DB column**, not recomputed on read |
| `total` | `productsTotal - productsDiscount + deliveryFee - couponDiscount`. Always built from the **net** total, never the gross one, so a coupon can never be applied against the pre-discount sticker price |

None of this money is derived here. The whole row of computed fields comes from `computeOrderTotals` in `@shared/helpers/products-totals` — spread over the order row — and the same helper backs the admin listing and the admin customer detail, so no surface can disagree on a total (see `src/shared/AGENTS.md`). Order items already match the helper's flat item shape, so they pass straight through; the coupon base at **creation** time goes through `computeProductsTotals` as well, mapping the cart items first.

That helper carries the `compareAtPrice > price` guard: a snapshot with `compareAtPrice` below or equal to `price` is not treated as a sale, so bad product data can never produce a negative `productsDiscount`.

**Orders placed before the `compareAtPrice` snapshot existed** carry `null` on every item, so they are never on sale: `productsDiscount` is `0`, `productsTotal` collapses to the price-based total, and `total` is byte-for-byte what it was before the field existed.

Unlike the cart response, the order response carries **no `isWelcomeCoupon` flag** and does not expose `couponId` — a client distinguishes a welcome discount from a real coupon solely by the `couponCode` matching the welcome code.

---

## Conventions

| Rule | Detail |
|---|---|
| Validate before writing | All cheap validations run before the transaction |
| Serialize concurrency | Per-customer order creation is serialized with a row-level lock on the customer; globally-limited coupon redemption with a row-level lock on the coupon |
| Items come ordered | Every read of an order's items sorts oldest-first and breaks the tie on the id — they share one `createdAt` from the batch insert, so without it the line order is arbitrary |
| Snapshots | Item details (including `compareAtPrice`), the address, and the applied coupon (code + discount) are snapshotted at purchase time and never back-filled |
| Money from the net total | The coupon base, the minimum-order check, and `total` all run on `productsTotal - productsDiscount` — the gross `productsTotal` is display-only |
| Customers cancel only while pending | Any later status is the admin's to transition |
| Atomic stock | Stock decrement and restore both happen inside the order transaction; the **decrement** is a guarded conditional update (restoring stock cannot fail the same way) |
| Decouple side effects | Ledger and notifications are driven by emitted lifecycle events, not direct calls |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
