# AGENTS.md — src/apps/admin/dashboard/

## What belongs here

Read-only aggregations for the backoffice dashboard. This module owns no entity: it reads rows
other modules write and returns comparable numbers over them. Every endpoint is a `GET`, sits
behind the class-level admin-auth composite, and performs no write.

Four readings, each with its own shape and universe — **an aggregate has exactly one home**
(the summary reading), and a figure that decomposes into a line is plotted on a series reading —
the summary's `deliveryFeeTotal` is the one deliberate exception: a period aggregate with no
matching series line. No reading other than the summary carries a `totals`/aggregate half.

Two of the four are series, and they do not share a universe: the order series plots money and
delivery counts, the accounts series plots signups. A figure belongs to whichever one owns its
universe — never to both.

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
| Accounts series | `GET /admin/dashboard/accounts-series` | `{ series: [...] }` — a time series and nothing else | Accounts **created** in range — `AnonymousCustomer.createdAt` and `Customer.createdAt`, counted apart. The only reading that never touches `order` |
| Performance | `GET /admin/dashboard/delivery-persons` | `{ deliveryPersons: [...] }` — a breakdown and nothing else | Orders **assigned to a delivery person and closed** (delivered or cancelled) |
| Series | `GET /admin/dashboard/series` | `{ series: [...] }` — a time series and nothing else | `DELIVERED` orders carrying a delivery timestamp, assigned or not |
| Summary | `GET /admin/dashboard/summary` | A flat object, 15 fields, no envelope | Every **closed** order (delivered or cancelled), assigned or not — the widest of the `order`-based readings — though its cancelled half surfaces only through `failedDeliveriesCount` (assigned rows): no field here counts cancelled orders as a whole |

All four take the same two optional, independent query params — `startDate` / `endDate` —
applied **verbatim as inclusive instants**: no timezone adjustment, no day-boundary snapping.
Omitting both gives lifetime figures. An inverted range (`endDate` before `startDate`) answers an
empty/zeroed result on every reading, never a 422 — there is no cross-module validator import for
it, and an empty answer is coherent for an empty interval.

**Both series readings' bucket granularity is adaptive**, chosen from the inclusive São Paulo-calendar
span between the bounds (shared date helper, `resolveDateRangeUnit`): **hourly** (`14:00`) for a
single day, **daily** (`26/08`) up to `MAX_DAILY_BUCKETS` (62) days, **monthly** (`Agosto/2026`)
beyond that or whenever a bound is missing. A caller cannot predict what a point represents without
this rule — do not assume daily buckets on an unbounded or wide-range call.

`GET /admin/dashboard/revenue` and `GET /admin/dashboard/orders` do not exist — only the four
readings above. `GET /admin/dashboard/series` is the **order** series; the accounts series lives on
its own path and shares nothing with it but the `{ series: [...] }` envelope and the label format.

---

## Field Reference

The same field name can mean a different universe on a different reading. This table is the
single place that resolves it — never assume two readings' same-named field are comparable
without checking here.

| Field | On | Universe | Notes |
|---|---|---|---|
| `deliveredOrdersCount` | performance (per person), series (per bucket), summary (period) | performance: assigned only · series: `DELIVERED` + stamped · summary: every delivered order, stamped or not | Three different scopes under one name. Summary ≥ series (ranged only, exact match) ≥ nothing comparable to performance |
| `cancelledOrdersCount` | performance (per person) | assigned orders that were cancelled | Performance-only: the summary has **no** period-wide counterpart. Its one figure over cancelled orders is `failedDeliveriesCount`, which is this counter's own universe summed |
| `deliveryFeeTotal` | performance (per person), summary (period) | performance: the roster's own universe — assigned orders, delivered **and** cancelled alike · summary: delivered orders carrying a stamp, assigned or not — same universe as `revenue` | Cents. **Two different universes under one name.** On performance it is not an earnings or payout figure: a cancelled order's fee counts the same as a delivered one, so read it as "fee attached to the orders that reached this person", never as what they are owed — and it reconciles with **nothing** on the summary, whose figure is delivered-only and counts unassigned orders too, so `Σ deliveryPersons[].deliveryFeeTotal` matches no field there. On summary it is the delivery-fee slice already embedded in `revenue` (which nets the coupon out on top of it), broken out on its own — and also subtracted back out of `profit`, since the fee is handed to the entregador rather than kept; it rides the same `sumRevenue` reducer as `revenue`/`couponDiscount`, but unlike them has **no** series counterpart to sum up from — the order series does not report it |
| `failedDeliveriesCount` | summary | same universe as performance's cancelled counter — assigned orders that were cancelled | Equals `Σ deliveryPersons[].cancelledOrdersCount` for the same range — two separate queries over the same predicate (the roster's `buildAssignedClosedFilter`, narrowed to the cancelled branch alone), not one shared result. The summary's **only** cancelled-order figure: it is narrower than the period's cancelled orders, so never read it as “orders cancelled in the window” |
| `averageOrderValue` | series (per bucket), summary (period) | delivered orders carrying a stamp | Cents. `average × deliveredOrdersCount ≈ revenue` holds exactly on series, and on summary only when a range is sent (unranged, summary's counter is the wider stamp-optional set) |
| `highestOrderValue` | summary | delivered orders carrying a stamp | A maximum — never sums or averages across periods |
| `revenue` / `couponDiscount` / `couponDiscountPercentage` | series (per bucket), summary (period) | delivered orders carrying a stamp | `revenue` is the full order total (delivery fee included — `deliveryFeeTotal` breaks out that slice on the summary — coupon already netted out); percentage divides by the gross (`revenue + couponDiscount`), 2 decimals, bounded by 100. `revenue` and `couponDiscount` sum from series to summary unconditionally; `couponDiscountPercentage` and `averageOrderValue` never do — both are recomputed per period/bucket, not summed |
| `firstDeliveredOrdersCount` | series (per bucket), summary (period) | delivered orders carrying a stamp; "first" is against the customer's **whole history**, not the range | Always sums from series to summary. The extra `groupBy` behind it only runs when `startDate` is sent — unranged, the answer is free (every customer in range is a first delivery by construction) |
| `redeemedCouponOrdersCount` | series (per bucket), summary (period) | delivered orders carrying a stamp, `couponDiscount > 0` | Counts **orders**, not distinct coupons (two orders on the same coupon count twice — and a coupon spanning two buckets counts in each). Always sums from series to summary when a range is sent. Divisor for the per-redemption average: `couponDiscount / redeemedCouponOrdersCount` |
| `newCustomersCount` | summary (period), accounts series (per bucket) | `Customer.createdAt` in range — the same universe and the same range filter on both | Signups, not purchases — includes soft-deleted customers (no `deletedAt` filter, unlike the admin customer listing). The only figure whose ranged and lifetime answers are directly comparable (`createdAt` is never null). Always sums from the accounts series to the summary, ranged or not — the two reads are field-for-field the same predicate |
| `newAnonymousCustomersCount` | accounts series (per bucket) | `AnonymousCustomer.createdAt` in range | One row per device that opened the store, not per visit. Has **no** summary counterpart — do not add one without deciding the conversion caveat below. Not disjoint from `newCustomersCount` over time: see the caveat |
| `averageDeliveryMinutes` | summary | assigned **and dispatched** orders (`shippedAt` not null) that were delivered — a narrower slice of `deliveredOrdersCount`'s universe (delivered, but not necessarily assigned or dispatched) | Mean span in whole minutes, dispatch → delivery, over rows the query already narrowed to delivered — the status narrowing is the query's, not the loop's, though the loop still skips a row whose `deliveredAt` is null (unranged, that is the backfilled rows). Not summable. `0` means an empty sample **or** a real instant close — no field on the summary discriminates the two for this figure; its sample is narrower than every counter here |
| `restockCost` / `profit` / `profitPercentage` | summary | `InventoryMovementProduct` lines, `origin = ADMIN_RESTOCK` | The only figures reading a table other than `order`/`customer`. `profit = revenue - restockCost - deliveryFeeTotal` (the delivery fee is passed through to the entregador, not kept, so it is netted out of profit); `profitPercentage = profit / revenue` still divides by `revenue`, not by a fee-adjusted base. `profit` and `profitPercentage` are the only fields in the module that can be **negative** |

`id` is read (to key the counter maps) but never returned in any payload.

---

## Invariants & Caveats

- **⚠️ A range filters on the order's closing timestamp** (`deliveredAt` / `cancelledAt`). Rows
  the 2026-08-18 migration backfill left unfilled are absent from **every** range — including one
  spanning all of history — while still counting in the lifetime (no-param) answer. Filtered
  totals are therefore not comparable to unfiltered ones, on every `order`-based reading except
  the order series, which requires the stamp with or without a range and so never includes those
  rows at all. The accounts series is outside this rule entirely — it filters `createdAt`, which
  is non-null and defaulted on both tables, so its ranged and lifetime answers are comparable.
- **Filtering is zone-blind; bucketing is not.** Every `where` clause applies its bounds as
  verbatim instants, unconditionally. **Both** series readings additionally bucket their rows into
  named periods in `America/Sao_Paulo` — the shared date helper is the only place in the module
  that consults a timezone. A caller that sends a bare date (no UTC offset) gets labels shifted by
  a day on either series; the fix is the caller sending the offset, never a snap added here.
- **No field ever returns `null`.** An empty sample answers `0`, same as a real zero measurement —
  the counter sitting beside a figure (e.g. `deliveredOrdersCount` beside `averageOrderValue`, or a
  bucket's own existence on the series) is what tells them apart. `averageDeliveryMinutes` is the
  exception: its sample is narrower than any summary counter, so nothing here discriminates its
  empty case from a real instant close.
- **Both series are sparse by construction.** A bucket exists only because it had a row — a
  delivery on the order series, an account creation on the accounts series; an empty period is left
  out, not zero-filled. Consecutive points are therefore not consecutive periods — the `label` is
  the only thing identifying which period a point covers, and its pt-BR, display-ready format is
  contract, not cosmetics. A bucket that had only one of the two account origins still answers a
  real `0` on the other, never `null`.
- **⚠️ The anonymous row is destroyed on conversion, so its history is not stable.**
  `attachAnonymousCartToCustomer` runs `tx.anonymousCustomer.delete`
  (`src/apps/store/customers/customers.service.ts`) when an anonymous visitor signs up, so
  `newAnonymousCustomersCount` for a **past** date shrinks over time as those visitors convert —
  the same range answers a smaller number tomorrow than it did today. The same person can also
  appear on both lines in different buckets (anonymous on the day they installed, customer on the
  day they registered) or on neither. Consequences: the two counters are **not** disjoint and must
  never be summed into a "unique accounts" figure, and the accounts series is not reproducible
  against an older snapshot. Do not "fix" this by soft-deleting the anonymous row — that is the
  store module's write path, not a dashboard decision.
- **The accounts series does not share the closing-stamp caveat.** `createdAt` is non-null and
  `@default(now())` on both tables, so unlike every order-based figure its ranged and lifetime
  answers are directly comparable and no backfilled row is silently excluded. It is also the only
  reading whose range is **entirely** unindexed — `Customer` and `AnonymousCustomer` carry no
  index on `created_at`, so both of its reads are sequential scans, accepted here the same way
  `restockCost`'s unindexed filter is.
- **The performance roster is never filtered on `isActive`.** A deactivated delivery person with
  history in the window still appears; do not add an active-only filter — that is a different
  rule and would silently drop past deliveries from the panel.
- **A cancelled order can legitimately carry a delivery-person assignment** (`SHIPPED →
  CANCELLED` is a valid transition, and no write path clears the FK). Read the cancelled counters
  as "cancelled after dispatch, in practice" rather than a guarantee — reassignment only checks
  the order's *current* status, so any cancelled order can be given a delivery person
  retroactively and then counts here regardless of when it was cancelled. This moves money, not
  only counts: the cancelled order's delivery fee lands in that person's `deliveryFeeTotal`, and a
  retroactive reassignment shifts it from one person to another.
- **`firstDeliveredOrdersCount`'s extra `groupBy` is bounded by the customers already in
  memory, not by a size cap.** A `startDate` far enough in the past rebuilds a customer id list
  that grows with the whole customer base, not the registered delivery persons — a wide enough
  range would eventually cross Postgres' parameter ceiling. Chunking the `IN` is the fix; do not
  "fix" it by narrowing the underlying `groupBy` with a date filter, which would break the
  "first against the customer's whole history" definition.
- **Do not re-add**: a `cancelledOrdersCount` on the summary (dropped — the period-wide cancelled
  counter has no consumer; `failedDeliveriesCount` covers the assigned slice, and the per-person
  breakdown covers the rest); a `totalOrdersCount` summing the two per-person counters (the caller
  sums them); an `accountsCount` summing the two account counters on the accounts series (same rule —
  the caller sums, and the sum is not a unique-account figure anyway);
  `averageRedeemedCouponDiscount` as its own field (recover it as
  `couponDiscount / redeemedCouponOrdersCount`); an `averageCancellationAfterShippingMinutes`
  on the summary (dropped — `spansSinceShipping` is delivered-only, and so is the `shippedOrders`
  read behind it: re-adding the figure means widening that `where`, not filtering in memory);
  zero-filled/enumerated series buckets; a day snap on the range bounds.

---

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — takes no argument, unlike the store/delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered — no not-found/conflict path exists here |
| No response DTO | Like the rest of the admin surface — the service hand-maps its result and that mapping *is* the contract |
| One query DTO per handler | Declares/validates the range params; no response DTO. Not deduplicated across the four handlers even though the DTOs are field-for-field identical — each is one handler's contract, free to diverge |
| Date params are parsed, never adjusted | `@Type(() => Date)` + `@IsDate()` (422 on `Invalid`) is the whole treatment — no `@Transform`, no timezone helper, no day-boundary snap |
| Sums accumulate; ratios/means are derived | A figure that adds up rides one shared reducer. A ratio or mean (`couponDiscountPercentage`, `averageOrderValue`, `profitPercentage`, `averageDeliveryMinutes`) is computed once from a bucket's/period's finished sums, never accumulated per row or carried between bucket and period |
| The range is built once, in a shared private | Returns `undefined` when neither bound is sent, so the key drops from the `where` entirely — except the series/summary delivered-orders read, which substitutes `{ not: null }`. Four privates layer on top of it: `buildStatusFilter` pairs one terminal status with its own closing column (`DELIVERED`→`deliveredAt`, `CANCELLED`→`cancelledAt`) and is where that pairing lives for the **ranged closed-order** filters — summary's two counters and its dispatch-timing read go through it, and so, via the composition below, does the roster. The two delivered-orders reads do **not**: `findDeliveredOrders` and the first-delivery `groupBy` substitute `{ not: null }` for the range and pair the column themselves, so changing `buildStatusFilter` does not reach them; `buildClosedStatusFilter` composes both of its branches into the terminal-status `OR`; `buildAssignedClosedFilter` adds the assignment clause on top of that `OR` — both of these are the performance roster's alone, since summary filters one status at a time; and the single `findDeliveredOrders` read is shared by series + summary. The accounts series layers nothing on it — it applies `buildDateRange` straight to `createdAt` on both tables, the same way summary's `newCustomersCount` does |
| A `groupBy` is earned by a second axis, never by a single count | The performance roster groups because it genuinely needs one number per person **per status** plus the fee `_sum` on the same pass — a relation `_count` cannot express several differently-filtered counts of one relation. The summary has no second axis: each of its counters is one differently-filtered count, so it issues a plain `count` per figure rather than grouping a wider universe and reading one bucket out of it — never fetch a status the reading does not report. Where a grouping *is* in flight, aggregates ride it (counts through `_count`, monetary columns through `_sum`) instead of earning a query of their own. A grouped average needs a numeric column, which a timestamp span is not — that is why `averageDeliveryMinutes` earns its own read |
| The performance roster is a dependent pair, never `$transaction` | Its `groupBy` runs before `deliveryPerson.findMany`, constrained to the ids the groups produced (a person's FK is `ON DELETE RESTRICT`, so no id can vanish between the two reads). No empty-case guard needed — an empty `in` list compiles to an always-false predicate. Every independent read elsewhere is issued together via `Promise.all`, not `$transaction` — nothing here is transactional, and the summary reading's 6 independent reads (delivered-count, delivered-orders, new-customers, restock-cost, assigned-cancelled-count, dispatch-timing) go out together; only the first-delivery `groupBy` waits, since it needs the customer ids the delivered-orders read names |
| Ordering ends on a unique column | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. No `groupBy` result needs one — it is only ever keyed or reduced, never shown in order |
| Indexes are shared across four modules | `Order` carries `@@index([status, deliveredAt])` and `@@index([status, cancelledAt])`, matching `buildClosedStatusFilter`'s two-branch `OR` — also used by `admin/orders/`, `admin/delivery-persons/` and `delivery-persons/orders/`. They cover the **ranged** reads only; the unbounded `findDeliveredOrders` and the first-delivery `groupBy` rely on a full scan / the FK index instead. `restockCost`'s `InventoryMovement (origin, createdAt)` filter is deliberately unindexed — restock is low-volume manual input, as is the accounts series' `created_at` filter on `Customer`/`AnonymousCustomer` |
| Mapping lives in the service | No `helpers.ts` here — the aggregation and row mapping sit in the service. A step earns a private when two readings share it, when it has its own round-trip shape (e.g. the roster's dependent `groupBy` → `findMany` pair), or when the mapping is more than a shape literal — a per-row reduction, a lookup against a keyed map, a derived ratio. A bucket mapping that is only a literal counting its own rows stays inline |
| A series never pre-groups by date | The shared date helper is generic and owns the bucketing: a series hands it one flat list of `{ date, data }` and maps the buckets it gets back. A reading drawing on **more than one source table** tags each entry with whatever distinguishes it and counts the tags per bucket; a single-table reading passes the whole row through as `data`. No `groupBy` on a date column, no `date_trunc`, no raw SQL — the zone-aware bucketing exists only in the helper |
| A series reads rows, not counts | A ranged count is not reusable for a series: the bucketing needs each row's own timestamp, so a series materializes every matching row (selecting only the columns it buckets and counts by) and reduces in memory. Unbounded, that is the whole table — the same known limit the first-delivery `groupBy` carries, and the reason the summary's equivalent aggregate can use a `count` while the series cannot |
