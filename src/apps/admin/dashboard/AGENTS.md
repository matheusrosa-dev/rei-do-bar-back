# AGENTS.md — src/apps/admin/dashboard/

## What belongs here

Read-only aggregations for the backoffice dashboard. This module owns no entity: it reads
rows other modules write and returns comparable numbers over them. Every endpoint here is
a `GET`, sits behind the class-level admin-auth composite, and performs no write.

Today it exposes two readings: delivery-person performance and revenue.

## What does NOT belong here

- Delivery-person CRUD, credentials, and revocation → `src/apps/admin/delivery-persons/`.
- Order listing and status transitions → `src/apps/admin/orders/`.
- The entregador's own shift count (the count of the logged-in delivery person) →
  `src/apps/delivery-persons/orders/`.
- Any write. A dashboard endpoint that mutates state belongs to the module that owns
  the entity.

---

## Delivery-person performance

`GET /admin/dashboard/delivery-persons` returns an **object with two halves**: `totals`,
a set of aggregate counters plus two average durations, and `deliveryPersons`, one entry
per delivery person with at least one closed order in the period. It is not a list
endpoint — no pagination, no configurable sort. It takes exactly two optional query
params, `startDate` and `endDate`, and nothing else. The shape is deliberately narrow, and
widening it is a product decision, not a refactor.

Both halves **count** the same universe: **orders that reached a delivery person and then
closed**, delivered or cancelled. Every counter on both sides carries the same filters —
a non-null delivery-person assignment, a terminal status, and the date range when one is
given — which is what keeps them reconcilable: the total counters are the column-wise sum
of the row counters. That invariant covers the counters only; the averages below sit
outside it deliberately.

Load-bearing decisions:

- **The two averages are not summable and do not describe the counted universe.** `totals`
  carries an average span from **dispatch to close**, one per terminal status, in whole
  minutes. They are totals-only by product decision — there is no per-person counterpart to
  recompose them from, and adding one would not restore the sum invariant anyway, since an
  average is not a column that adds up. More important, they run over a **strict subset** of
  the counted orders: only those carrying a dispatch stamp, which the timings read asks
  for. The service checks the *closing* stamp again on each row, and that second check is
  belt-and-braces: every path that writes a terminal status writes its stamp in the same
  update, and no order predating the dispatch column can reach the read anyway, so a row
  that gets this far always has both. It stays because it is what keeps a missing stamp out
  of the arithmetic instead of turning the whole field into `NaN`. Two consequences that a reader
  of the panel has to be told about, because nothing in the numbers reveals them:
  - the dispatch column was added with **no backfill**, so every order shipped before it
    existed is outside both averages while still inside both counters — an old period can
    answer a high delivered count next to a `null` average, and that is correct;
  - an order cancelled **before** it ever shipped has no dispatch stamp and no street time
    to measure, so it counts and is not averaged. The cancellation field is named for that
    qualifier rather than leaving it implicit. The delivery field needs no such name: the
    state machine has no arrow into delivered that skips dispatch.

  A status with no sample answers **`null`, never `0`** — zero would read as an instant
  close. The spans are averaged in milliseconds and rounded **once, at the end**, to the
  nearest minute, so `0` is still a legitimate answer for a real sub-half-minute average;
  `null` is what separates "nothing to measure" from "measured, and very fast". Rounding
  each order first and averaging the results would drift, and is not what happens. Same
  spirit as the `NULL` caveat below: accepted contract, not a defect.

- **Only delivery persons with closed orders in the period are listed**, but the roster is
  never filtered on its own attributes. The listed ids come from the `groupBy` result, so a
  deactivated entregador still appears while they have history in the window, and a person
  with nothing closed is absent instead of coming back as a zero row. Filtering on `isActive`
  would be a different rule and would silently drop past deliveries from the panel — do not
  add it.
- **The bounds are the caller's instants, used verbatim.** `startDate` / `endDate` are
  optional and independent, parsed to a `Date` and handed straight to Prisma as `gte` / `lte`.
  The module deliberately performs **no** timezone work: it does not snap to a day boundary,
  does not consult `America/Sao_Paulo`, and imports nothing from the date helper. Whoever
  calls decides what a period means — send an offset (`2026-08-01T00:00:00-03:00`) and the
  instant is unambiguous; send a bare `YYYY-MM-DD` and JavaScript reads it as UTC midnight,
  which is the caller's call to make, not this module's to correct. Do not reintroduce a snap
  here: two layers each nudging a boundary is how a period silently stops meaning what the
  client asked for.
- **With no param the counts are lifetime**, exactly as before the filter existed. That
  default is load-bearing — the frontend integrated against it. This is also deliberately
  *not* `getRecentOrdersWindowStart()`: that rolling window belongs to the shift counters in
  `admin/orders/`, `admin/delivery-persons/`, and `delivery-persons/orders/`; its 10-hour
  **length** is a constant (the function itself does take an optional `now`), it is not
  caller input, and it has no zone at all.
- **⚠️ A range filters on the closing timestamp, so rows with a `NULL` one disappear.**
  `deliveredAt` / `cancelledAt` were added by the migrations of 2026-08-18, whose backfill
  deliberately stopped at the 10-hour boundary (inside it `updatedAt` is bumped by delivery-person
  reassignment and would invent a date). Those rows were never filled, and a SQL comparison
  against `NULL` is `UNKNOWN`, so **they are absent from every range — including one spanning
  all of history** — while still counting when no param is sent. Filtered totals are therefore
  not comparable to unfiltered ones. This is accepted contract, not a defect: closing it needs
  a backfill migration, not an endpoint change.
- **An inverted range (`endDate` before `startDate`) returns zeros, not a 422.** The
  `IsAfterDate` validator that would catch it lives in `admin/coupons/validators/`, and
  importing it across feature modules would couple them; zero is a coherent answer for an
  empty interval. If this ever has to 422, move that validator to `@shared/` rather than
  duplicating it here.
- **The `groupBy` runs first and drives the roster read.** The counts query executes before
  `deliveryPerson.findMany`, which is then constrained to `id: { in: <ids from the groups> }`.
  That ordering is what makes "only who has orders" a query rather than a post-filter, and it
  needs no empty-case guard: no groups means an empty `in` list, which Prisma compiles to an
  always-false predicate — an empty roster and zeroed totals, at the cost of one round-trip
  that returns nothing. Do not swap the two reads back.
- **A single `groupBy` feeds both counted halves.** The module groups `order` by
  `["deliveryPersonId", "status"]` once; the per-person half keys the result on
  `` `${id}:${status}` ``, and the totals half reduces the same groups per status. That is
  the primary reason for the shape — a relation `_count` could not serve it, since
  `_count.select` accepts the `orders` relation only once and cannot express several
  differently-filtered counts of it. Adding a status to the panel never costs another
  *count* query — but it is not one edit either: a branch in the `OR`, a counter in the
  totals builder, a field in the row builder, a branch in the timings builder if the new
  status is worth timing, and a decision on whether it belongs inside the summed total all
  have to move together, or the total silently stops matching its parts.
- **The assignment filter is `deliveryPersonId: { not: null }`, not an id list.** It
  expresses the same set as passing every registered id, without a query that grows with
  the roster, and it removes the need for an empty-roster guard: with no delivery persons
  there are no assigned orders, so the `groupBy` returns nothing and every counter reads
  zero on its own.
- **Only terminal statuses are counted, and the status filter lives inside an `OR`.**
  `DELIVERED` and `CANCELLED` are the two ends of the line, so the counters are mutually
  exclusive buckets and their sum is the total. An order still in transit is deliberately
  absent from every counter — the panel reports closed outcomes, not work in progress. The
  filter is a two-branch `OR` rather than a flat `status: { in: [...] }` because each status
  carries its **own** timestamp column, so the range has to be paired with the matching one.
  With no range the range object is `undefined`, Prisma drops the comparison, and the `OR`
  degrades to exactly the old `in` filter. The single branch on "was a param sent" sits inside
  the `where` builder, next to the clause it feeds, and resolves to `undefined`; the clause
  itself is built once and never forks, so one query shape serves both cases.
- **Cancelled orders legitimately carry a `deliveryPersonId`.** The status-transition
  state machine allows `SHIPPED → CANCELLED`, and no write path ever clears the FK
  (`admin/orders/orders.service.ts` only adds fields on transition; admin reassignment
  explicitly accepts already-cancelled orders). The cancelled counter therefore reads as
  *cancelled after dispatch* in practice — an order cancelled while still `PENDING` carries
  no delivery person and lands in no counter. Treat that as the normal case, not a
  guarantee: the reassignment endpoint guards on the order's **current** status only, so any
  `CANCELLED` order can be given a delivery person retroactively, however it was cancelled,
  and it then counts here.

### Coupling to watch

Because both counted halves derive from one `groupBy`, the total counters are the sum of
the listed rows by construction. The averages sit outside that: they come from a read of
their own, and no arrangement of rows adds up to them. The date range does **not** threaten
that: it narrows the *order* universe, which every read shares, so they narrow together and
the counters still reconcile. The roster `findMany`
narrows with them — its `where` is derived from the group result, never from the delivery
person's own attributes — so it can only drop rows that would have counted zero.

What would break it is a filter on the **roster** that the groups do not imply: active
delivery persons only, a search term, a slice. Those would shrink the listed rows without
shrinking the aggregate, and the total counters would then have to move to a `groupBy` of
their own
— or, worse, silently start reporting a subset while claiming to be the whole.

The three reads (`groupBy` for the counts, `findMany` for the roster, `findMany` for the
timings) run **outside** a transaction — the same looseness the sibling listing in
`admin/delivery-persons/` accepts between its roster and its counts, though that one does
wrap its roster and its total in a `$transaction` pair.

Both counted halves still come from the one grouping, so they can never contradict each
other, and under this ordering **no interleaving skews them either** — an invariant worth
relying on rather than defending against. The **timings read is the one that can drift**: it
runs last, so an order that closes between it and the `groupBy` is averaged without being
counted, and the panel can answer a non-null average beside a count that does not include
it. Nothing is wrong when that happens — the averages already describe a different set of
orders than the counters do — and closing the gap would mean wrapping all three in a
transaction to buy consistency between figures that are not comparable anyway.

Every id in the groups has at least one order attached, and such a delivery person cannot
vanish between the reads: the FK is `onDelete: Restrict` and
`admin/delivery-persons/` refuses the deletion with `DELIVERY_PERSON_HAS_ORDERS`. Nothing in
`src/` deletes an order either, so the roster read always resolves every id the grouping
produced. (The previous ordering — roster first — did have a window, where a delivery person
created and credited with a whole closed delivery in between landed in `totals` with no row
of their own.)

The status filter is load-bearing, not a formality: an assigned order sitting in `SHIPPED`
is excluded from every counter on purpose, so "orders that reached a delivery person" means
*and have since closed*. Both counted halves apply the same filter, so they stay reconcilable with
each other — but neither reconciles against the raw count of assigned orders, and they will
not, as long as anything is in transit.

## Revenue

`GET /admin/dashboard/revenue` answers what the store took in over a period and how much
of it was given away as coupon. Unlike the reading above it returns a **flat object of
aggregates** — there is no per-row half, because the question has no row to break down
into. It takes the same two optional params, `startDate` / `endDate`, under the same
verbatim-instant rule, and nothing else.

Load-bearing decisions:

- **The universe is every `DELIVERED` order, assigned or not.** It is deliberately
  *wider* than the delivery-person reading, which additionally requires a non-null
  assignment and also counts cancellations. The two endpoints answer different questions
  over different sets, and the numbers below are the consequence.
- **⚠️ `deliveredOrdersCount` is the name of a counter on both endpoints, scoped
  differently.** Here it counts every delivered order; on the delivery-person reading it
  counts only the ones that reached an entregador. For the same period the two legitimately
  disagree, and nothing in either payload reveals it. Do not treat them as the same figure,
  and do not "fix" the divergence by narrowing this one — the wider set is the point.
- **Revenue is the full order total, delivery fee included**, computed by the shared order
  totals helper rather than restated here. That helper is what the store charges with, so
  reusing it is what keeps the panel from drifting away from the note; if the total's
  formula changes, this number moves with it, which is the intent. `Order` stores no total
  or subtotal column, so the figure has to come from the item rows either way.
- **The discount figure is the coupon discount only.** A product's promotional price is a
  discount too, but it is already absorbed *inside* revenue and is deliberately not
  reported beside it — the field answers "quanto foi abatido por cupom", not "quanto foi
  abatido". Consequently **revenue is already net of the coupon**: `revenue +
  couponDiscount` is the gross, not a double count.
- **An empty period answers zeros, never `null`.** Nothing delivered means nothing
  invoiced, and zero says exactly that. This is the opposite of the averages above, where
  zero would be a lie and `null` is the empty answer — the difference is that a sum over no
  rows has a meaningful identity and a mean does not.
- **⚠️ A range filters on the delivery timestamp, so rows with a `NULL` one disappear.**
  The same caveat the delivery-person reading carries, and for the same unbackfilled
  column: those orders count when no param is sent and vanish from **every** range,
  including one spanning all of history. Filtered revenue is not comparable to lifetime
  revenue.
- **An inverted range returns zeros, not a 422** — same as the sibling, same reason.
- **One read, no `groupBy`.** No aggregate can express the figure: it needs
  `price * quantity` per item, which neither `aggregate` nor `groupBy` multiplies. So the
  rows are fetched narrow — the fee, the coupon snapshot, and the item price/quantity — and
  reduced in the service, the same shape the admin order listing already uses to sort by
  total. The count comes free from the fetched rows and never earns a query of its own.
- **⚠️ That read takes no `take`, and it is heavier than the timings read above.** It pulls
  every delivered order ever **plus all of its item rows**, and unlike the timings read it
  is not gated on the dispatch stamp, so the missing backfill does not hold its volume down
  either. The row count that will hurt is the items, not the orders. Cap it or push the
  aggregation into the database when the volume justifies it, not before.

### Coupling to watch

Nothing reconciles across the two endpoints — not the counters, not the money. They share
only the range semantics and the private that builds it. Adding a figure to one is never a
reason to add it to the other.

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — it takes no argument, unlike the store and delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered for this module because it has no not-found or conflict path |
| No response DTO | Like the rest of the admin surface, there is no `@Serialize` layer — the service hand-maps its result and that mapping *is* the contract |
| `dtos/` holds only what a handler receives | The query DTO is where the range params are declared and validated, never in the service. There is still no *response* DTO. **One DTO per handler**, even when two are field-for-field identical: they are free to diverge, and a shared base is what a third range-filtered endpoint would earn, not the second |
| Date params are parsed, never adjusted | `@Type(() => Date)` parses and `@IsDate()` rejects what came out `Invalid` (→ 422) — and that is the whole treatment. No `@Transform`, no timezone helper, no day boundary: the instant the client sent is the instant that reaches the query. The nearest thing to a counter-example is the coupon DTOs' *end* bound, which does snap (their start bound only carries a floor), and the difference is intentional — a coupon window is a calendar rule the store owns, a dashboard range is a question the caller is asking |
| Counters come from one read; the averages earn a second *(performance reading)* | Never issue a second query for a total that the existing `groupBy` can reduce. The averages are the one thing it cannot: a grouped average needs a numeric column, and the span between two timestamps is not one, so they get a read of their own. That read **reuses the same `where` object** and only narrows it by the dispatch stamp — rebuilding the filter, in another shape or another language, is exactly how the two halves stop describing the same orders |
| The spans are averaged in the service, not in SQL *(performance reading)* | Raw SQL could aggregate them in the database, but it would restate the two-branch `OR` and the optional range a second time. Sharing the `where` object literally is what makes drift impossible. The price is the row fetch: it takes no `take`, and the default period is lifetime, so it grows with every order ever dispatched — the missing backfill holds the count down today but that bound expires by one day per day, and nothing will signal the crossing. Cap it or move the aggregation into the database when the volume justifies it, not before |
| Ordering ends on a unique column *(where anything is ordered)* | The revenue read orders nothing — it is reduced, never shown row by row. The roster sorts `[{ name: "asc" }, { id: "asc" }]`. Nothing is sliced, but without the tiebreaker equal names reshuffle between requests. The `groupBy` needs none — its result is only ever keyed or reduced, never shown in order |
| The range is built once, in a shared private | Both readings derive their date filter from the same private, which returns `undefined` when neither bound is sent so the key drops from the `where` entirely. Restating the range per endpoint is how two panels start disagreeing about what a period means |
| Mapping lives in the service | There is no `helpers.ts` here, unlike the sibling resource modules: the aggregation and the row mapping are private methods fed by the shared query result. Add the file only when something outside the service needs the shape |
| `id` is read but not returned | The service selects `id` to key the count map and drops it from the response. Exposing it is a one-line change if a client needs a stable row key |
| The roster is scoped by the counts, not the reverse | `deliveryPerson.findMany` runs after the `groupBy` and takes its ids. Anything that needs a person absent from the groups needs a second query, not a widened `where` here |
