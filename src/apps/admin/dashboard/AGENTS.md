# AGENTS.md — src/apps/admin/dashboard/

## What belongs here

Read-only aggregations for the backoffice dashboard. This module owns no entity: it reads
rows other modules write and returns comparable numbers over them. Every endpoint here is
a `GET`, sits behind the class-level admin-auth composite, and performs no write.

Today it exposes three readings: delivery-person performance, series, and summary. Two of them
read the same delivered-orders rows through the same private and are deliberately kept apart —
see below. **The three do not share one shape**: performance pairs an aggregate half with a
breakdown half, series is a breakdown and nothing else (`{ series }`, no `totals` key), and
summary is the aggregate over the rows series plots. That is the module's settled division:
**plot it on the series reading, total it on summary.** There were four readings until the
revenue and orders endpoints — by then both series-only over the same query — were merged into
the one series endpoint.

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
a single aggregate counter plus two average durations, and `deliveryPersons`, one entry
per delivery person with at least one closed order in the period. It is not a list
endpoint — no pagination, no configurable sort. It takes exactly two optional query
params, `startDate` and `endDate`, and nothing else. The shape is deliberately narrow, and
widening it is a product decision, not a refactor.

Both halves **count** the same universe: **orders that reached a delivery person and then
closed**, delivered or cancelled. Every counter on both sides carries the same filters —
a non-null delivery-person assignment, a terminal status, and the date range when one is
given — which is what keeps them reconcilable: `cancelledOrdersCount` in `totals` is the
column-wise sum of the row `cancelledOrdersCount`s. **The two halves are deliberately not
symmetric**: the rows also carry `deliveredOrdersCount`, and `totals` does not. It carried
one, alongside a `totalOrdersCount` that summed the two, and both were removed — the
delivered figure has two better homes (`series` for every delivered order, per bucket, and
`summary` for every closed one), and the sum of two counters is something the caller can do. What is
left in `totals` is the one counter no other reading answers over this universe. Re-adding
either is a product decision, not a fix: nothing in the module needs them, and the roster is
where a delivered count over *this* universe still lives. The sum invariant therefore covers
one column now; the averages sit outside it deliberately, as they always did.

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
    answer a high delivered count next to a `0` average, and that is correct;
  - an order cancelled **before** it ever shipped has no dispatch stamp and no street time
    to measure, so it counts and is not averaged. The cancellation field is named for that
    qualifier rather than leaving it implicit. The delivery field needs no such name: the
    state machine has no arrow into delivered that skips dispatch.

  **⚠️ A status with no sample answers `0`, and so does a real instant close** — the module
  answers no `null` anywhere, a deliberate call so the panel never has to render an empty
  state per field. The two cases are therefore indistinguishable in the field itself: what
  separates them is the counter beside it, which is `0` only in the empty case. The spans are
  averaged in milliseconds and rounded **once, at the end**, to the nearest minute, so a `0`
  can also be a real sub-half-minute average. Rounding each order first and averaging the
  results would drift, and is not what happens. Do not reintroduce `null` here for the empty
  sample without changing the whole module: the no-nulls rule is module-wide.

- **Only delivery persons with closed orders in the period are listed**, but the roster is
  never filtered on its own attributes. The listed ids come from the `groupBy` result, so a
  deactivated entregador still appears while they have history in the window, and a person
  with nothing closed is absent instead of coming back as a zero row. Filtering on `isActive`
  would be a different rule and would silently drop past deliveries from the panel — do not
  add it.
- **The bounds are the caller's instants, used verbatim.** `startDate` / `endDate` are
  optional and independent, parsed to a `Date` and handed straight to Prisma as `gte` / `lte`.
  The **filter** deliberately performs no timezone work: it does not snap to a day boundary and
  does not consult `America/Sao_Paulo`. (The module as a whole is no longer zone-blind — the
  series reading buckets through the shared date helper. That is the
  *grouping*, never the bounds; see that section.) Whoever
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
  status is worth timing, and a decision on whether `totals` should report it at all all
  have to move together. The last one is a genuine choice rather than a formality: `totals`
  reports one status today and the roster reports two, so a new status is not owed a place in
  both halves.
- **The assignment filter is `deliveryPersonId: { not: null }`, not an id list.** It
  expresses the same set as passing every registered id, without a query that grows with
  the roster, and it removes the need for an empty-roster guard: with no delivery persons
  there are no assigned orders, so the `groupBy` returns nothing and every counter reads
  zero on its own.
- **Only terminal statuses are counted, and the status filter lives inside an `OR`.**
  `DELIVERED` and `CANCELLED` are the two ends of the line, so the roster's two counters are
  mutually exclusive buckets over the same rows. An order still in transit is deliberately
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

Because both counted halves derive from one `groupBy`, the counter in `totals` is the sum of
the listed rows' matching column by construction — over the one status it still reports. The
averages sit outside that: they come from a read of their own, and no arrangement of rows
adds up to them. The date range does **not** threaten
that: it narrows the *order* universe, which every read shares, so they narrow together and
the counters still reconcile. The roster `findMany`
narrows with them — its `where` is derived from the group result, never from the delivery
person's own attributes — so it can only drop rows that would have counted zero.

What would break it is a filter on the **roster** that the groups do not imply: active
delivery persons only, a search term, a slice. Those would shrink the listed rows without
shrinking the aggregate, and the counter in `totals` would then have to move to a `groupBy` of
its own
— or, worse, silently start reporting a subset while claiming to be the whole.

The three reads (`groupBy` for the counts, `findMany` for the roster, `findMany` for the
timings) run **outside** a transaction — the same looseness the sibling listing in
`admin/delivery-persons/` accepts between its roster and its counts, though that one does
wrap its roster and its total in a `$transaction` pair.

Both counted halves still come from the one grouping, so they can never contradict each
other, and under this ordering **no interleaving skews them either** — an invariant worth
relying on rather than defending against. The **timings read is the one that can drift**: it
runs last, so an order that closes between it and the `groupBy` is averaged without being
counted, and the panel can answer a non-zero average beside a count that does not include
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

## Series

`GET /admin/dashboard/series` plots what the store took in over time, how much of it was
given away as coupon, how many orders it delivered, and what one was worth on average.
*Delivered*, not *closed*: the word means delivered **or cancelled** on the performance
reading above, and a cancellation counts nowhere here.

**⚠️ The payload is `{ series }` and nothing else — there is no `totals` half.** Every
aggregate over these rows lives on the summary reading. Do not add one back: the module's
division is **plot it here, total it there**, and how the figures are split between the two is
the only reason both exist.

**⚠️ This endpoint is the merge of two that came before it, and both their routes are gone
rather than deprecated** — a client still calling `GET /admin/dashboard/revenue` or
`GET /admin/dashboard/orders` gets a 404. They had each lost their aggregate half to the
summary reading, and what was left was two endpoints issuing the same query over the same rows
and returning the same labels with different fields hung on them. Merging them halves the cost
of drawing the panel and removes the possibility of the two disagreeing.

A point carries `deliveredOrdersCount`, `averageOrderValue`, `revenue`, `couponDiscount` and
`couponDiscountPercentage`, in that order. The summary reading answers those same five names
in the same relative order and with the same arithmetic — both payloads reduce the rows through
the same `sumRevenue`, read `revenue` off the result, spread the same coupon builder, and take
the ticket médio out of the same one. **Its `deliveredOrdersCount` is the exception**: that one
comes from a `groupBy` over a wider set, not from these privates at all, which is the whole
subject of the reconciliation rules below. It takes the
same two optional params, `startDate` / `endDate`, under the same verbatim-instant rule, and
nothing else.

Load-bearing decisions:

- **The universe is every `DELIVERED` order, assigned or not.** It is deliberately
  *wider* than the delivery-person reading, which additionally requires a non-null
  assignment and also counts cancellations. The two readings answer different questions
  over different sets, and the numbers below are the consequence.
- **The merge closed a drift risk rather than opening one.** The two old readings shared
  `findDeliveredOrders` precisely so their figures would describe the same orders; now there is
  one reading and one read, and that guarantee is structural instead of maintained. What is left
  of the coupling points at the summary reading, which still issues the same private — that is
  what makes the sums below reconcile across the two endpoints. Splitting this reading back in
  two is not a refactor: it re-creates the risk the merge removed, and nothing in either payload
  would show it.
- **Revenue is the full order total, delivery fee included**, computed by the shared order
  totals helper rather than restated here. That helper is what the store charges with, so
  reusing it is what keeps the panel from drifting away from the note; if the total's
  formula changes, this number moves with it, which is the intent. `Order` stores no total
  or subtotal column, so the figure has to come from the item rows either way.
- **The discount figure is the coupon discount only.** A product's promotional price is a
  discount too, but it is already absorbed *inside* revenue and is deliberately not reported
  beside it — the field answers "quanto foi abatido por cupom", not "quanto foi abatido".
  Consequently **revenue is already net of the coupon**: `revenue + couponDiscount` is the
  gross, not a double count.
- **The gross is recomposable per bucket, and for the period from the summary reading.** A
  point carries both halves of that sum; the period's gross needs the summary reading's
  `revenue` and `couponDiscount`. The two endpoints are guaranteed to describe the same rows —
  one private issues the read for both — so the arithmetic is safe across them.
- **`couponDiscountPercentage` divides by that gross, not by `revenue`.** It answers what
  share of what the store *would* have taken in was given away as coupon —
  `couponDiscount / (revenue + couponDiscount) * 100` — so it is bounded by 100 and reads the
  same way whether or not a coupon was used. Dividing by `revenue` alone would inflate it (the
  denominator has already lost the discount) and could exceed 100. Two decimals, rounded
  **once at the end**, and raw — the `%` sign is the client's business. The promotional price
  stays outside it on both sides of the fraction, for the same reason it stays out of
  `couponDiscount`. A bucket with no gross reports `0`, like every other empty answer here.
- **`averageOrderValue` is the ticket médio: the point's own `revenue` divided by its own
  count.** What the store actually took per delivered order, delivery fee included and net of
  coupon, because that is what the revenue figure is. Dividing the gross instead would answer
  what the orders were *worth* before the coupon — a different question, and one no other
  figure could be reconciled against. **Both operands now sit on the same point**, so
  `averageOrderValue × deliveredOrdersCount ≈ revenue` (off only by the rounding) is a check a
  client can run inside one payload; before the merge it needed two requests. It is an
  **integer in cents**, rounded once at the end.
- **⚠️ `deliveredOrdersCount` is the name of a counter on three readings, scoped differently
  on each — and on two of them it is not an aggregate.** Here it counts every delivered order
  **carrying a delivery stamp**, per bucket only; on the performance reading, only the ones that
  reached an entregador, per entregador only; on the summary reading, every delivered order,
  stamp or not, as a period aggregate. For the same period the three legitimately disagree —
  this one is bounded above by the summary's and is not comparable to the performance one at
  all — and nothing in any payload reveals it. Do not treat them as the same figure, and do not
  "fix" the divergence by narrowing this one: the stamp is what makes every figure on a point
  describe the same rows.
- **⚠️ Re-adding the per-redemption coupon average is not a one-line restore.**
  `averageRedeemedCouponDiscount` divided by the delivered orders that **carried a coupon**
  (`couponDiscount > 0`), not by every delivered order — it answered "what a coupon
  was worth when one was used", never "what the store gives away per delivered order", which
  divides by `deliveredOrdersCount` and answers a much smaller number. Two averages side by
  side with two divisors was the trap its name existed to defuse. Anyone bringing it back owes
  the same care: the numerator needs no filter of its own (an order without a coupon
  contributes `0`, so the summed `couponDiscount` is already it), the
  predicate is `couponDiscount > 0` rather than `couponId != null` — same column, already in
  the `select`, and a coupon worth nothing would otherwise drag the average down with a
  redemption that redeemed nothing — and the divisor belongs in the builder beside the field it
  feeds. Its removal also took with it **the only unambiguous `0` in the module**: every order
  in that divisor carried at least a cent of discount, so its zero could only mean "no coupon
  used in this period" and never "an average too small to show". No field left in the module
  has that property. The summary reading answers the divisor itself as
  `redeemedCouponOrdersCount`, so a client can recover the period-wide average from that
  payload alone — but there is no per-bucket counterpart here, and adding one is a new field,
  not a restore.
- **An empty period is an empty series, and that is the whole payload.** There is no
  aggregate half to answer a zero in, which removes an ambiguity rather than adding one:
  a bucket only exists because it had a delivery, so a `0` on a point is always a real
  measurement — an order paid entirely by coupon — never an empty sample. That is the one
  place in the module where the no-nulls rule costs nothing.
- **The read requires a delivery stamp, with or without a range.** A range filters on
  `deliveredAt`, and a SQL comparison against `NULL` is `UNKNOWN`, so a ranged read already
  drops the stamp-less rows; the unranged read asks for `not: null` explicitly so that it
  drops them too. Without that the same counter would mean one thing filtered and another
  unfiltered — the asymmetry the performance and summary readings still carry. The cost is that
  a `DELIVERED` row with no stamp would vanish from the series entirely rather than counting in
  a figure it cannot be plotted in; no write path produces that row (status and stamp are
  written in the same update), and the state is unreachable rather than merely unlikely.
- **An inverted range returns an empty series, not a 422** — same as the sibling readings, same
  reason.
- **One read, no `groupBy`.** No aggregate can express the money: it needs
  `price * quantity` per item, which neither `aggregate` nor `groupBy` multiplies. So the
  rows are fetched narrow — the delivery stamp, the fee, the coupon snapshot, and the item
  price/quantity — and reduced in the service, the same shape the admin order listing already
  uses to sort by total. The count comes free from the fetched rows and never earns a query of
  its own.
- **⚠️ That read takes no `take`, and it is heavier than the timings read above.** It pulls
  every delivered order ever **plus all of its item rows**, and unlike the timings read it
  is not gated on the dispatch stamp, so the missing backfill does not hold its volume down
  either. The row count that will hurt is the items, not the orders. Cap it or push the
  aggregation into the database when the volume justifies it, not before. The series costs
  nothing on top of it: it is grouped in memory from the rows already fetched, never a
  second query. **A panel that draws the whole dashboard now pays for that read twice**, here
  and on the summary reading — it was three times before the merge, and merging those two would
  not be the same trade: they are split on what they answer, not on what they cost.

### Bucketing

- **⚠️ The bucket consults `America/Sao_Paulo`; the filter still does not.** These are two
  different things and the distinction is load-bearing. The range bounds remain the
  caller's instants used verbatim, exactly as the rule above states — what the timezone
  decides is only which bucket a delivered order falls into. A delivery at 21h BRT is
  midnight UTC the next day, and the store's peak hours are in the evening, so bucketing in
  UTC would plot a whole evening on the wrong point of the line. Do not "unify" the two by
  making the filter zone-aware, and do not drop the zone from the bucket.
- **The granularity is adaptive and the client cannot choose it.** Three tiers, picked from
  the span in inclusive São Paulo calendar days: **hourly** for a single day, **daily** up to
  `MAX_DAILY_BUCKETS` (62) days, **monthly** beyond that. A year of daily points is ~365
  entries no line chart can render, and a single day of daily points is one entry, which is
  not a line at all. An open-ended interval has no length to measure, so a missing bound falls
  back to months regardless.
- **⚠️ A caller that omits the offset gets an axis shifted by a day.** This is the
  verbatim-instant rule meeting the São Paulo bucket, and the label is what makes the
  mismatch visible: a bare `2026-08-01`/`2026-08-31` is read as UTC midnight, so the series
  runs `31/07 … 30/08` and its first point holds only the 21:00–00:00 BRT sliver of 31 July.
  Nothing is internally inconsistent — the sum invariant and the 62-day threshold both
  survive, since every bound shifts alike — but the chart is labelled wrong. **Sending the
  offset (`2026-08-01T00:00:00-03:00`) is an integration requirement, not a nicety**, and the
  fix belongs in the caller: snapping the bounds here would break the verbatim rule the
  filter depends on.
- **The series is always sparse: a bucket with no delivery is absent, never a zeroed
  point.** This holds at every granularity and with or without bounds — the helper builds the
  series from the grouped keys alone and never enumerates the interval, so a closed range is
  no different from an open one. It is the same rule the performance reading follows for a
  delivery person with nothing closed. **The consequence for a client is that consecutive
  points are not consecutive periods**: two adjacent points can be a day or a year apart, and
  a chart that spaces them evenly will draw an idle stretch as if it never existed. Only the
  `label` says which period a point is, which is one more reason the label format is contract.
- **No ceiling is needed, because the point count is bounded by the data.** A series can
  never be longer than the number of delivered orders in the range, so an absurd but valid
  range (1900–2100) costs points only where deliveries exist. This is why the helper carries
  no cap and why the series reconciles with the summary reading unconditionally. Do not
  reintroduce interval enumeration to "fill the gaps" here: it is what the cap, the truncation
  rule and the year-9999 cursor hazard all existed to contain. The 62-day threshold does still
  live **in the shared date helper, not here** — this module cannot override it — so changing
  it is a shared-helper change with a shared-helper blast radius.
- **Granularity and density are separate rules, and only one of them is still adaptive.**
  The tier depends on the range's span; the density does not depend on anything — it is
  sparse always. Changing the 62-day span does not touch that, and vice versa.
- **A point carries a `label` and nothing else identifying it.** No ISO date, no
  granularity field — a product decision. The ISO bucket exists only inside the service, as
  the grouping and sort key. Consequences to hold on to: **the array order is the entire
  ordering contract**, the granularity is only inferrable from the label's shape, and the
  label format is therefore **contract, not cosmetics** — changing it is a breaking change.
  A client that needs to reprocess the series needs a `date` field that does not exist yet;
  adding one is purely additive and breaks nobody.
- **`label` is a user-facing string, so it is pt-BR** — `14:00` hourly, `dd/MM` daily,
  `Agosto/2026` monthly, the last capitalized because a chart axis reads better that way. It
  is the one place in this module where a response field is formatted rather than raw.
- **The series sums to the summary reading's aggregates, unconditionally for the money and
  under a range for the count.** Every fetched row carries a stamp, so each lands in exactly one
  bucket and no bucket is dropped; both readings reduce the same rows, so `revenue` and
  `couponDiscount` each add up across the points to the figure the summary reading reports for
  the same period. `deliveredOrdersCount` adds up to its namesake there only when a bound is
  sent — unranged, that counter comes from a `groupBy` that also takes in the stamp-less legacy
  rows this read excludes. **The invariant spans two endpoints** — there is no aggregate half
  left here to check against — and that is only safe because the read is issued by one private.
  Do not reintroduce a path where a row counts in an aggregate without belonging to a bucket;
  that asymmetry is what the query filter exists to prevent, and what a truncating cap would
  have brought back.
  `couponDiscountPercentage` and `averageOrderValue` are exempt and always were: each is
  recomputed from its own bucket's figures, so neither is the sum of the points nor their
  average — a day of 50% beside a day of 0% with ten times the revenue is ~5% for the period,
  not 25%. Averaging the buckets would weight a quiet day like a busy one; there is no
  per-bucket figure to recompose the period's from, and there does not need to be, since both
  are derived from sums that do reconcile. The summary reading's own share and its ticket médio
  are governed by the same argument.
- **An inverted range yields an empty series**, consistent with the zeros the other readings
  answer. That takes an explicit guard in the helper: the rows are filtered by the query, not by
  the grouping, so without it an inverted range would simply bucket whatever came back instead
  of answering nothing.
- **The granularity token is the shared helper's calendar unit, and that is what keeps the
  tiers on one code path.** The same value is handed to every calendar function, so the three
  never fork into parallel branches here. A fourth tier is a change to that shared type — it
  has to be a unit luxon understands — not something this module can add alone.
- **⚠️ The bucket key carries full precision at every tier, and the tier is not its concern.**
  Keys look like `2026-08-26T14:00` whatever the unit — `startOf(unit)` has already zeroed
  whatever the tier does not use, so a month reads `2026-08-01T00:00`. Dropping the time for
  the coarser tiers is the tempting simplification and it is how the hourly tier broke once:
  a key built from the date alone collapses all 24 hours of a day onto one entry **and**
  labels them all `00:00`, since the formatter parses the key back — one mistake with two
  symptoms. The key only has to sort as a string and round-trip through `fromISO`; **which
  tier shows what is the formatter's business alone**.
  The key format is written out at a **single site** in the helper, the grouping loop, and the
  formatter parses it back — there is no second producer to keep in sync. Adding one (an
  interval enumerator, say) reintroduces a drift no test would catch by design: keys that stop
  matching hand back a series with the right labels and no data.
- **The key cannot be the label, and that is why there are two of them.** Ordering is a
  `.sort()` over the keys as strings — the only ordering there is — so the key has to sort
  chronologically: `["01/09", "26/08"].sort()` puts September first, and `Agosto` sorts before
  `Julho`. Collapsing the two into one field scrambles every chart.
- **The rows are reduced once per bucket, and the builders take those sums rather than the
  rows.** `sumRevenue` runs a single time for a point; `buildOrdersTotals` and
  `buildCouponTotals` are handed the result, and `revenue` is read straight off it — it needs no
  builder of its own, and the one it used to have existed only to hide the reduction. The
  summary reading calls the same two privates over the same sums for its period-wide figures,
  which is what makes a point and a period the same computation *by construction* rather than by
  two implementations agreeing. **Each builder computes its fields once and every call site names
  what it keeps** — the summary reading keeps the average and discards the count it passed in as
  a divisor. Narrowing happens *after* the arithmetic, never by a second builder or a flag:
  forking a builder to omit a field is how two callers stop being the same computation. The
  derivations wrap the reducer rather than riding it as extra accumulators: neither a ratio nor a
  mean can be accumulated row by row, so each is computed once per bucket, from that bucket's
  finished sums. **A count travels with the sums it divides**, passed in beside them rather than
  recounted inside each builder — splitting a divisor from the field it feeds is how a payload
  ends up counting its rows twice under two different names. It is the same argument as sharing
  the `where` object on the performance reading: restating the sum per caller is how they start
  to drift. The two reductions the summary reading still runs on its own — the priciest order
  and the redemption count — stay separate on purpose: they are different reductions, not the
  same one repeated.
- **The bucketing is written once and calls the point builder directly.** It used to take that
  builder as a parameter, which is what let the revenue and orders readings share one grouping
  while returning different fields; with those two merged there is one point shape and one
  caller, so the parameter was removed rather than left standing as generality nothing uses. A
  second series reading would bring it back — that is a deliberate re-widening, not a
  restoration, and it needs the same reason the first one had.
- **The calendar work lives in the shared date helper, not here.** Resolving the unit,
  counting inclusive days, formatting the label and keying an instant to its bucket are
  calendar concerns with no notion of an order, so they sit next to the zone string that
  already owned `America/Sao_Paulo`. This module hands that function the rows and the range
  and reduces what comes back; it imports luxon nowhere.
- **The adaptive granularity shrinks the series; the data is what bounds it.** Falling back
  to months divides the point count by ~30, but what actually keeps the payload small is that
  only periods with a delivery become points. The unbounded `findMany` remains the heavier
  limit, and the granularity tier does not touch it.

### Coupling to watch

Nothing reconciles between this reading and the performance one — not the counters, not the
money, and not the two breakdowns, which are different kinds over different universes. They
share only the range semantics and the private that builds it. Adding a figure to one is never
a reason to add it to the other. The **summary** reading is the single exception in the module:
it reads the same rows through the same private, so its aggregates do reconcile with these
points, under the conditions spelled out above.

## Summary

`GET /admin/dashboard/summary` answers eight numbers and nothing else: how many orders the
store delivered, how many it cancelled, what a delivered one was worth on average, what the
priciest one was worth, how many of them redeemed a coupon, what the store took in, how much
coupon was given away, and what share of the gross that was. It takes the same two optional params under the same
verbatim-instant rule. **It is where every aggregate over delivered orders now lives** —
figures arrived here from the two readings that were later merged into the series one, and the
rule that put them here is that an aggregate has exactly one home. It is the module's
aggregate-only reading — the one a panel calls when it wants the period's figures without a
line to plot.

**⚠️ It used to be the cheap one and no longer is.** The counters still cost a single
`groupBy` with no item rows; the money figures added the same unbounded delivered-orders
`findMany` the series reading issues, items included. A panel that draws both pays for that
read twice. Adding another aggregate over those rows is free — the rows
are already in memory, which is why `highestOrderValue` and `redeemedCouponOrdersCount` cost
nothing on top of the average; adding one that needs a different universe, or a column the
shared `select` does not carry, is not.

Load-bearing decisions:

- **The payload is flat: no `totals` envelope, no second half.** The readings that still have
  two halves wrap their aggregates in `totals` because there is a breakdown beside it to
  reconcile against. There is none here, and a one-key envelope over a two-field object would only
  suggest a half that does not exist. If a breakdown is ever added, that is the moment the
  envelope arrives — and it is a breaking change, deliberately deferred rather than paid for
  up front.
- **The universe is every *closed* order, assigned or not.** Only the two terminal statuses
  are counted — an order sitting in `PENDING`, `PREPARING` or `SHIPPED` counts in neither
  counter, here as everywhere else in the module. Within that, this is the module's widest
  reading: no `deliveryPersonId` filter, so an order cancelled while still `PENDING`, which
  ordinarily carries no entregador and so lands in no counter on the performance reading,
  counts here. Treat that as the normal case, not a guarantee — the reassignment endpoint
  guards on the order's **current** status only, so a `CANCELLED` order can be given an
  entregador retroactively and then counts on both readings. Covering the cancellations that
  never reached anyone is what "total de pedidos cancelados" means on a panel, and it is the
  reason this reading exists next to the performance one rather than inside it.
- **⚠️ Both counters share a name with a counter elsewhere in the module, and no payload
  says which is which.** Against the **series** reading, the relation depends on the range:
  send a bound and this reading's `DELIVERED` branch is the series reading's `where`
  character-for-character, so this counter equals the **sum of that reading's points** by
  construction — that reading carries no aggregate count, so there is no single field
  there to compare against;
  send none and this one keeps the stamp-less rows the other drops, so it is ≥. Against the
  **performance** reading there is no such correspondence — that one requires an entregador
  instead — so both counters here are ≥ its namesakes with or without a range. Only one of
  those namesakes is still an aggregate: that reading's `totals` answers a cancelled counter
  and no delivered one, which lives only in its per-person rows. Do not
  generalize the ranged equality into a promise that the two readings agree: it holds for
  that one figure only, and only because the filters are literally the same object shape.
- **⚠️ With no param the counts are lifetime and include the stamp-less rows, so filtered
  totals are not comparable to unfiltered ones.** This follows the performance reading's rule,
  not the series one: a range filters on the closing timestamp and a SQL comparison
  against `NULL` is `UNKNOWN`, so the rows the 2026-08-18 migrations left unfilled are absent
  from **every** range — one spanning all of history included — while still counting when no
  param is sent. Deliberate: this reading answers "quantos pedidos", and dropping a real
  delivered order from the lifetime total because a backfill stopped short would be the worse
  answer. Closing the gap needs a backfill migration, not an endpoint change.
- **⚠️ `averageOrderValue` does not divide by the `deliveredOrdersCount` beside it.** The
  counter comes from the `groupBy`, which with no range takes in the stamp-less legacy rows;
  both money figures come from the delivered-orders read, which requires the stamp always.
  Numerator and divisor therefore describe the same set as each other — that is the property
  worth keeping — but **not** the set the counter reports, so `averageOrderValue ×
  deliveredOrdersCount ≈ revenue` holds under a range and fails without one. Dividing by the
  reported counter instead would look tidier and be wrong: the extra orders contribute no
  revenue to the numerator, so the average would be diluted by rows the money read never saw.
  This is the same figure the series reading answers per bucket, from the same builder over the
  same rows, so the two never disagree about a period they both cover.
- **`highestOrderValue` is the priciest delivered order of the period, on the same total as
  everything else.** It reduces the same rows through `computeOrderTotals`, so it carries the
  delivery fee, is net of coupon, and has the promotional price already absorbed — the figure
  the store charged, comparable to `averageOrderValue` and to the series reading's `revenue`
  by construction. It sits in the same universe as the average and inherits its caveat: the
  **delivered orders carrying a stamp**, not the wider set the counter reports. An `0` means
  the period delivered nothing, or delivered only orders that invoiced nothing — the
  module-wide no-nulls rule again, with the counters beside it as the tiebreaker.
  It is a **maximum, not a sum or a mean**, so it is the one figure here that neither adds up
  across periods nor recomposes from them: the priciest order of a year is the priciest of one
  of its months, never a function of the twelve. It rides its own small reducer rather than
  `buildOrdersTotals` deliberately — putting it there would spread it into every point of the
  point of the series reading, which is not what was asked for and would change that payload.
- **`revenue`, `couponDiscount` and `couponDiscountPercentage` came from the aggregate half of
  the reading that is now the series one, and kept their arithmetic exactly.** `revenue` is the full order total, delivery fee
  included, computed by the shared order totals helper rather than restated here — if the
  store's formula changes, this number moves with it. The discount is the **coupon** discount only — a product's
  promotional price is absorbed into revenue and reported as a discount nowhere. The share
  divides by the **gross**, `couponDiscount / (revenue + couponDiscount) * 100`, never by
  `revenue`: revenue is already net of the coupon, so dividing by it would inflate the figure
  past 100. Two decimals, rounded once at the end, raw — the `%` sign is the client's business.
  The `revenue` in that denominator **is** reported, as its own field: it moved here from that
  reading's `totals`, which is now gone entirely. All three money figures also exist
  **per bucket** on the series reading — this is their period-wide home, not their only one,
  and the two are consistent because both reduce the same rows. A period with no gross has
  no ratio to report and answers `0` anyway; a real `0` is the ordinary case of a period that
  sold and used no coupon. An order paid **entirely** by coupon reads `100`, not `0`, because
  the coupon cancels out of the gross.
- **⚠️ `redeemedCouponOrdersCount` counts *orders*, not distinct coupons.** Two orders
  redeeming the same coupon count two, by product decision. The name says `Orders` for that
  reason and should not be shortened to `redeemedCouponsCount`, which would promise a
  `DISTINCT` over the coupon id that this figure does not do — and could not do without
  widening the shared read, which carries no coupon id at all.
  The predicate is `couponDiscount > 0`, the same column the discount figures use and already
  in the `select`, rather than `couponId != null`: **an order that carried a coupon worth
  nothing is therefore not counted**. The two only diverge on a coupon that discounted zero
  cents, which no write path produces today; closing that gap means adding `couponId` to the
  read this and the series reading share, so it is a shared-read change, not a local one.
  This is the divisor the removed `averageRedeemedCouponDiscount` used, now reported in its own
  right — and with `couponDiscount` totalled on this same payload, a client that wants that
  average back divides one field of this reading by another and gets exactly the figure that
  was removed, with no second request.
  **⚠️ It counts only inside this reading's universe: delivered orders carrying a stamp.** A
  coupon redeemed on an order that was later cancelled is not here, and neither is one on an
  order still in progress — so this is not "how many coupons the store honoured", it is "how
  many delivered orders paid with one". The counters beside it do not share that universe
  either, so it is **not** comparable to `cancelledOrdersCount` and is bounded by
  `deliveredOrdersCount` only when a range is sent.
- **The average reuses the series reading's builder and its read, not a copy of either.**
  `findDeliveredOrders` and `buildOrdersTotals` are the same privates that feed the points next
  door, which is what makes the number here and the points there the same computation. The
  builder's count is discarded at this call site, deliberately: it is the average's divisor,
  not this payload's counter, and conflating the two is exactly the trap the bullet above
  describes.
- **One `groupBy` by status for the counters, no `count` pair.** `by: ["status"]` with
  `_count: true` returns both in one round-trip, reduced by the same `countByStatus`
  the performance reading uses. Two `prisma.order.count` calls would read the same rows twice
  to answer the same thing. That the reducer is shared at all is a typing decision:
  `countByStatus` takes the minimal `StatusGroup` (`{ status, _count }`), which both groupings
  satisfy — `OrderGroup` is that shape plus `deliveryPersonId`. Re-narrowing the parameter to
  `OrderGroup[]` compiles fine for the performance reading and silently pushes this one into a
  reducer of its own.
- **The terminal-status `OR` is shared with the performance reading**, through
  `buildClosedStatusFilter` — the same private, called with the same range semantics. The
  performance reading is that filter plus the assignment clause, and nothing else. Restating
  the two branches here is how the two readings start disagreeing about what a closed order
  is; a status added to one is added to both by construction, which is the point.
- **An empty period answers zeros and an inverted range answers zeros** — the module-wide
  no-nulls rule, same as everywhere else. The average carries the module's usual ambiguity: a
  `0` is an empty period or a period paid entirely by coupon, and here the counters beside it
  are what separate the two.

### Coupling to watch

Nothing here reconciles with the performance reading's `totals`, which counts over a
different universe. The series reading is the exception, and only halfway: under any range its
points and this counter are the same query and therefore the same number once they are summed,
while unranged they diverge by exactly the stamp-less rows. What this reading *does* share is the filter: widening
`buildClosedStatusFilter` moves this reading and the performance one together, and neither
payload would show it.

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — it takes no argument, unlike the store and delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered for this module because it has no not-found or conflict path |
| No response DTO | Like the rest of the admin surface, there is no `@Serialize` layer — the service hand-maps its result and that mapping *is* the contract |
| `dtos/` holds only what a handler receives | The query DTO is where the range params are declared and validated, never in the service. There is still no *response* DTO. **One DTO per handler**, even when all three are field-for-field identical: each is one handler's contract and free to diverge. The base has never been extracted, through a fourth endpoint arriving and two later merging away — deliberately: it would save a handful of lines and couple three panels' query contracts, so what would earn it is a range param that actually has to change everywhere at once, not another endpoint taking the same two dates. The merge is the argument, not a counter-example: two DTOs collapsed into one because their **handlers** collapsed, which is exactly the rule working |
| Date params are parsed, never adjusted | `@Type(() => Date)` parses and `@IsDate()` rejects what came out `Invalid` (→ 422) — and that is the whole treatment. No `@Transform`, no timezone helper, no day boundary: the instant the client sent is the instant that reaches the query. The nearest thing to a counter-example is the coupon DTOs' *end* bound, which does snap (their start bound only carries a floor), and the difference is intentional — a coupon window is a calendar rule the store owns, a dashboard range is a question the caller is asking |
| Filtering is zone-blind; bucketing is not | The rule above governs the **`where`** and is unconditional. Grouping rows into named periods is a different problem — a calendar day only exists in some zone — and the series reading resolves it in `America/Sao_Paulo`, in the service, never in the DTO. Keep the two apart: a zone leaking into a bound is a period silently changing meaning, and a bucket without one is an evening plotted on the wrong day |
| Sums are accumulated; ratios and means are derived from them | A figure that adds up rides the reducer that feeds every caller of it. A figure that does not — the coupon percentage and the ticket médio, per bucket on the series reading and period-wide on the summary one — is computed from the finished sums of that bucket or that period, never accumulated per row and never carried over from one to the other. An empty sample gives them nothing to divide by and they answer `0` like everything else — **no field in this module ever answers `null`**, so a counter is the only thing that separates an empty sample from a real zero, and where a payload no longer reports one (the performance reading's `totals`) that distinction moves elsewhere. A divisor one of them needs (the row count) belongs in the same builder, not at the call site, and stays there even when the payload stops showing it |
| A formatted label is the exception, not the pattern | Response fields here are raw values the client formats. The series' `label` is the one that ships display-ready, in pt-BR, because it exists to be rendered on an axis — which also makes its format part of the contract. Do not generalize it to other fields, and do not add a second formatted field without deciding it is worth the same lock-in |
| Counters come from one read; the averages earn a second *(performance reading)* | Never issue a second query for a total that the existing `groupBy` can reduce. The averages are the one thing it cannot: a grouped average needs a numeric column, and the span between two timestamps is not one, so they get a read of their own. That read **reuses the same `where` object** and only narrows it by the dispatch stamp — rebuilding the filter, in another shape or another language, is exactly how the two halves stop describing the same orders |
| The spans are averaged in the service, not in SQL *(performance reading)* | Raw SQL could aggregate them in the database, but it would restate the two-branch `OR` and the optional range a second time. Sharing the `where` object literally is what makes drift impossible. The price is the row fetch: it takes no `take`, and the default period is lifetime, so it grows with every order ever dispatched — the missing backfill holds the count down today but that bound expires by one day per day, and nothing will signal the crossing. Cap it or move the aggregation into the database when the volume justifies it, not before |
| Ordering ends on a unique column *(where anything is ordered)* | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. Nothing is sliced, but without the tiebreaker equal names reshuffle between requests. Neither `groupBy` needs one — its result is only ever keyed or reduced, never shown in order. Neither does the delivered-orders read the series and summary readings share: its rows are grouped in memory, and the series is ordered by its own bucket keys, which are unique by construction |
| The range is built once, in a shared private | All three readings derive their date filter from the same private, which returns `undefined` when neither bound is sent so the key drops from the `where` entirely. Two pairs go further and share more than the range: the series and summary readings share the whole delivered-orders read (one private issues that `findMany` for both), and the performance and summary readings share the terminal-status `OR` (`buildClosedStatusFilter`, which the performance one only adds the assignment clause to). Summary sits in both pairs, which is what makes it the reading that reconciles against the other two. Restating the range — or the read, or the filter — per endpoint is how two panels start disagreeing about what a period means |
| Mapping lives in the service | There is no `helpers.ts` here, unlike the sibling resource modules: the aggregation and the row mapping are private methods fed by the shared query result. Add the file only when something outside the service needs the shape |
| `id` is read but not returned | The service selects `id` to key the count map and drops it from the response. Exposing it is a one-line change if a client needs a stable row key |
| The roster is scoped by the counts, not the reverse | `deliveryPerson.findMany` runs after the `groupBy` and takes its ids. Anything that needs a person absent from the groups needs a second query, not a widened `where` here |
