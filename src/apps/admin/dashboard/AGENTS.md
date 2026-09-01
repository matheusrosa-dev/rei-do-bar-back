# AGENTS.md — src/apps/admin/dashboard/

## What belongs here

Read-only aggregations for the backoffice dashboard. This module owns no entity: it reads rows
other modules write and returns comparable numbers over them. Every endpoint is a `GET`, sits
behind the class-level admin-auth composite, and performs no write.

Three readings, each with its own shape and universe — **an aggregate has exactly one home**
(the summary reading), and a figure that decomposes into a line is plotted on the series reading.
Neither the performance nor the series reading carries a `totals`/aggregate half.

## What does NOT belong here

- Delivery-person CRUD, credentials, and revocation → `src/apps/admin/delivery-persons/`.
- Order listing and status transitions → `src/apps/admin/orders/`.
- The entregador's own shift count (the count of the logged-in delivery person) →
  `src/apps/delivery-persons/orders/`.
- Any write. A dashboard endpoint that mutates state belongs to the module that owns the entity.

---

## Readings

| Reading | Endpoint | Payload | Universe |
|---|---|---|---|
| Performance | `GET /admin/dashboard/delivery-persons` | `{ deliveryPersons: [...] }` — a breakdown and nothing else | Orders **assigned to a delivery person and closed** (delivered or cancelled) |
| Series | `GET /admin/dashboard/series` | `{ series: [...] }` — a time series and nothing else | `DELIVERED` orders carrying a delivery timestamp, assigned or not |
| Summary | `GET /admin/dashboard/summary` | A flat object, 16 fields, no envelope | Every **closed** order (delivered or cancelled), assigned or not — the widest of the three |

All three take the same two optional, independent query params — `startDate` / `endDate` —
applied **verbatim as inclusive instants**: no timezone adjustment, no day-boundary snapping.
Omitting both gives lifetime figures. An inverted range (`endDate` before `startDate`) answers an
empty/zeroed result on every reading, never a 422 — there is no cross-module validator import for
it, and an empty answer is coherent for an empty interval.

**The series reading's bucket granularity is adaptive**, chosen from the inclusive São Paulo-calendar
span between the bounds (shared date helper, `resolveDateRangeUnit`): **hourly** (`14:00`) for a
single day, **daily** (`26/08`) up to `MAX_DAILY_BUCKETS` (62) days, **monthly** (`Agosto/2026`)
beyond that or whenever a bound is missing. A caller cannot predict what a point represents without
this rule — do not assume daily buckets on an unbounded or wide-range call.

`GET /admin/dashboard/revenue` and `GET /admin/dashboard/orders` do not exist — only the three
readings above.

---

## Field Reference

The same field name can mean a different universe on a different reading. This table is the
single place that resolves it — never assume two readings' same-named field are comparable
without checking here.

| Field | On | Universe | Notes |
|---|---|---|---|
| `deliveredOrdersCount` | performance (per person), series (per bucket), summary (period) | performance: assigned only · series: `DELIVERED` + stamped · summary: every delivered order, stamped or not | Three different scopes under one name. Summary ≥ series (ranged only, exact match) ≥ nothing comparable to performance |
| `cancelledOrdersCount` | performance (per person), summary (period) | performance: assigned only · summary: every cancelled order | Summary's is ≥ `Σ deliveryPersons[].cancelledOrdersCount` |
| `assignedCancelledOrdersCount` | summary | same universe as performance's cancelled counter | Equals `Σ deliveryPersons[].cancelledOrdersCount` for the same range — two separate queries sharing `buildAssignedClosedFilter`, not one shared result |
| `averageOrderValue` | series (per bucket), summary (period) | delivered orders carrying a stamp | Cents. `average × deliveredOrdersCount ≈ revenue` holds exactly on series, and on summary only when a range is sent (unranged, summary's counter is the wider stamp-optional set) |
| `highestOrderValue` | summary | delivered orders carrying a stamp | A maximum — never sums or averages across periods |
| `revenue` / `couponDiscount` / `couponDiscountPercentage` | series (per bucket), summary (period) | delivered orders carrying a stamp | `revenue` is the full order total (delivery fee included, coupon already netted out); percentage divides by the gross (`revenue + couponDiscount`), 2 decimals, bounded by 100. `revenue` and `couponDiscount` sum from series to summary unconditionally; `couponDiscountPercentage` and `averageOrderValue` never do — both are recomputed per period/bucket, not summed |
| `firstDeliveredOrdersCount` | series (per bucket), summary (period) | delivered orders carrying a stamp; "first" is against the customer's **whole history**, not the range | Always sums from series to summary. The extra `groupBy` behind it only runs when `startDate` is sent — unranged, the answer is free (every customer in range is a first delivery by construction) |
| `redeemedCouponOrdersCount` | series (per bucket), summary (period) | delivered orders carrying a stamp, `couponDiscount > 0` | Counts **orders**, not distinct coupons (two orders on the same coupon count twice — and a coupon spanning two buckets counts in each). Always sums from series to summary when a range is sent. Divisor for the per-redemption average: `couponDiscount / redeemedCouponOrdersCount` |
| `newCustomersCount` | summary | `Customer.createdAt` in range | Signups, not purchases — includes soft-deleted customers (no `deletedAt` filter, unlike the admin customer listing). The only figure whose ranged and lifetime answers are directly comparable (`createdAt` is never null) |
| `averageDeliveryMinutes` / `averageCancellationAfterShippingMinutes` | summary | assigned **and dispatched** orders (`shippedAt` not null) — a subset of `assignedCancelledOrdersCount`'s universe | Mean span in whole minutes, dispatch → close. Not summable. `0` means an empty sample **or** a real instant close — tell the two apart via the counter beside it |
| `restockCost` / `profit` / `profitPercentage` | summary | `InventoryMovementProduct` lines, `origin = ADMIN_RESTOCK` | The only figures reading a table other than `order`/`customer`. `profit = revenue - restockCost`; `profit` and `profitPercentage` are the only fields in the module that can be **negative** |

`id` is read (to key the counter maps) but never returned in any payload.

---

## Invariants & Caveats

- **⚠️ A range filters on the order's closing timestamp** (`deliveredAt` / `cancelledAt`). Rows
  the 2026-08-18 migration backfill left unfilled are absent from **every** range — including one
  spanning all of history — while still counting in the lifetime (no-param) answer. Filtered
  totals are therefore not comparable to unfiltered ones, on every reading except the series one,
  which requires the stamp with or without a range and so never includes those rows at all.
- **Filtering is zone-blind; bucketing is not.** The rule above governs every `where` clause,
  unconditionally. The series reading additionally buckets rows into named periods in
  `America/Sao_Paulo` — the only place in the module that consults a timezone. A caller that sends
  a bare date (no UTC offset) gets series labels shifted by a day; the fix is the caller sending
  the offset, never a snap added here.
- **No field ever returns `null`.** An empty sample answers `0`, same as a real zero measurement —
  the counter sitting beside a figure (e.g. `assignedCancelledOrdersCount` beside the two
  averages, or a bucket's own existence on the series) is what tells them apart.
- **The series is sparse by construction.** A bucket exists only because it had a delivery; an
  empty period is an empty array, not a zero-filled series. Consecutive points are therefore not
  consecutive periods — the `label` is the only thing identifying which period a point covers, and
  its pt-BR, display-ready format is contract, not cosmetics.
- **The performance roster is never filtered on `isActive`.** A deactivated delivery person with
  history in the window still appears; do not add an active-only filter — that is a different
  rule and would silently drop past deliveries from the panel.
- **A cancelled order can legitimately carry a delivery-person assignment** (`SHIPPED →
  CANCELLED` is a valid transition, and no write path clears the FK). Read the cancelled counters
  as "cancelled after dispatch, in practice" rather than a guarantee — reassignment only checks
  the order's *current* status, so any cancelled order can be given a delivery person
  retroactively and then counts here regardless of when it was cancelled.
- **`firstDeliveredOrdersCount`'s extra `groupBy` is bounded by the customers already in
  memory, not by a size cap.** A `startDate` far enough in the past rebuilds a customer id list
  that grows with the whole customer base, not the registered delivery persons — a wide enough
  range would eventually cross Postgres' parameter ceiling. Chunking the `IN` is the fix; do not
  "fix" it by narrowing the underlying `groupBy` with a date filter, which would break the
  "first against the customer's whole history" definition.
- **Do not re-add**: a `totalOrdersCount` summing the two per-person counters (the caller sums
  them); `averageRedeemedCouponDiscount` as its own field (recover it as
  `couponDiscount / redeemedCouponOrdersCount`); zero-filled/enumerated series buckets; a day
  snap on the range bounds.

---

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — takes no argument, unlike the store/delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered — no not-found/conflict path exists here |
| No response DTO | Like the rest of the admin surface — the service hand-maps its result and that mapping *is* the contract |
| One query DTO per handler | Declares/validates the range params; no response DTO. Not deduplicated across the three handlers even though the DTOs are field-for-field identical — each is one handler's contract, free to diverge |
| Date params are parsed, never adjusted | `@Type(() => Date)` + `@IsDate()` (422 on `Invalid`) is the whole treatment — no `@Transform`, no timezone helper, no day-boundary snap |
| Sums accumulate; ratios/means are derived | A figure that adds up rides one shared reducer. A ratio or mean (`couponDiscountPercentage`, `averageOrderValue`, `profitPercentage`, the two duration averages) is computed once from a bucket's/period's finished sums, never accumulated per row or carried between bucket and period |
| The range is built once, in a shared private | Returns `undefined` when neither bound is sent, so the key drops from the `where` entirely — except the series/summary delivered-orders read, which substitutes `{ not: null }`. Three privates layer on top of it: `buildClosedStatusFilter` (terminal-status `OR`, shared by performance + summary), `buildAssignedClosedFilter` (adds the assignment clause, shared by performance's roster and summary's `assignedCancelledOrdersCount` + averages), and the single `findDeliveredOrders` read shared by series + summary |
| Counters come from one `groupBy`; the durations earn a second read | Never issue a second query for a total the existing `groupBy` can reduce (a relation `_count` cannot express several differently-filtered counts of one relation). A grouped average needs a numeric column, which a timestamp span is not — that is the one thing that earns its own read, reusing the shared `where` rather than restating it |
| The performance roster is a dependent pair, never `$transaction` | Its `groupBy` runs before `deliveryPerson.findMany`, constrained to the ids the groups produced (a person's FK is `ON DELETE RESTRICT`, so no id can vanish between the two reads). No empty-case guard needed — an empty `in` list compiles to an always-false predicate. Every independent read elsewhere is issued together via `Promise.all`, not `$transaction` — nothing here is transactional, and the summary reading's 6 independent reads (counters, delivered-orders, new-customers, restock-cost, assigned-counters, shipped-orders) go out together; only the first-delivery `groupBy` waits, since it needs the customer ids the delivered-orders read names |
| Ordering ends on a unique column | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. No `groupBy` result needs one — it is only ever keyed or reduced, never shown in order |
| Indexes are shared across four modules | `Order` carries `@@index([status, deliveredAt])` and `@@index([status, cancelledAt])`, matching `buildClosedStatusFilter`'s two-branch `OR` — also used by `admin/orders/`, `admin/delivery-persons/` and `delivery-persons/orders/`. They cover the **ranged** reads only; the unbounded `findDeliveredOrders` and the first-delivery `groupBy` rely on a full scan / the FK index instead. `restockCost`'s `InventoryMovement (origin, createdAt)` filter is deliberately unindexed — restock is low-volume manual input |
| Mapping lives in the service | No `helpers.ts` here — the aggregation and row mapping sit in the service, in a private only when two readings share it or a step has its own round-trip shape (e.g. the roster's dependent `groupBy` → `findMany` pair) |
