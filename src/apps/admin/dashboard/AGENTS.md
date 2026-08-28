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
  The **filter** deliberately performs no timezone work: it does not snap to a day boundary and
  does not consult `America/Sao_Paulo`. (The module as a whole is no longer zone-blind — the
  revenue series buckets through the shared date helper. That is the *grouping*, never the
  bounds; see the series section.) Whoever
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
of it was given away as coupon. Like the reading above it returns an object with **two
halves** — `totals`, the aggregates for the whole period, and `series`, the same four
figures broken down over time so a client can plot them. The halves are not the same kind
as the sibling's: `series` is a **time series**, not a roster of entities, and it
reconciles against `totals` only under the condition spelled out below. It takes the same
two optional params, `startDate` / `endDate`, under the same verbatim-instant rule, and
nothing else.

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
- **`couponDiscountPercentage` divides by that gross, not by `revenue`.** It answers what
  share of what the store *would* have taken in was given away as coupon —
  `couponDiscount / (revenue + couponDiscount) * 100` — so it is bounded by 100 and reads
  the same way whether or not a coupon was used. Dividing by `revenue` alone would inflate
  it (the denominator has already lost the discount) and could exceed 100. It is a number
  with **two decimals**, rounded **once at the end** like the sibling's averages, and it is
  raw — the `%` sign is the client's business. The promotional price stays outside it on
  both sides of the fraction, for the same reason it stays out of `couponDiscount`.
- **⚠️ It is derived, not summed, so it is `null` where the sums are `0`.** A period — or a
  bucket — with no gross has no ratio to report, and `0` would read as "sold, and gave
  nothing away" rather than "nothing to measure". This is the one field on this endpoint
  that follows the sibling's `null` rule instead of the zero rule below, and the reason is
  the same one that separates them there: a sum over no rows has an identity, a ratio does
  not. A real `0` is still reachable and means a period that sold and used no coupon.
- **An empty period answers zeros, never `null` — for the sums.** Nothing delivered means
  nothing invoiced, and zero says exactly that. This is the opposite of the averages above,
  where zero would be a lie and `null` is the empty answer — the difference is that a sum
  over no rows has a meaningful identity and a mean does not. `couponDiscountPercentage` is
  on the other side of that line: it is a ratio, so it answers `null`. Two rules on one
  payload is the intended state, not an inconsistency to tidy up.
- **The read requires a delivery stamp, with or without a range.** A range filters on
  `deliveredAt`, and a SQL comparison against `NULL` is `UNKNOWN`, so a ranged read already
  drops the stamp-less rows; the unranged read asks for `not: null` explicitly so that it
  drops them too. Without that the same counter would mean one thing filtered and another
  unfiltered — the asymmetry the sibling reading still carries. The cost is that a
  `DELIVERED` row with no stamp would vanish from revenue entirely rather than counting in a
  figure it cannot be plotted in; no write path produces that row (status and stamp are
  written in the same update), and the state is unreachable rather than merely unlikely.
- **An inverted range returns zeros, not a 422** — same as the sibling, same reason. Zeros
  for the sums, that is; the share answers `null` there like in any other empty period.
- **One read, no `groupBy`.** No aggregate can express the figure: it needs
  `price * quantity` per item, which neither `aggregate` nor `groupBy` multiplies. So the
  rows are fetched narrow — the delivery stamp, the fee, the coupon snapshot, and the item
  price/quantity — and
  reduced in the service, the same shape the admin order listing already uses to sort by
  total. The count comes free from the fetched rows and never earns a query of its own.
- **⚠️ That read takes no `take`, and it is heavier than the timings read above.** It pulls
  every delivered order ever **plus all of its item rows**, and unlike the timings read it
  is not gated on the dispatch stamp, so the missing backfill does not hold its volume down
  either. The row count that will hurt is the items, not the orders. Cap it or push the
  aggregation into the database when the volume justifies it, not before. The series costs
  nothing on top of it: it is grouped in memory from the rows already fetched, never a
  second query.

### The series

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
- **The dense path is capped at `MAX_BUCKETS` (600) points, and the cap truncates.** The
  ceiling lives **in the shared date helper, not here** — this module neither passes it in nor
  can override it, so it is a limit on every future caller of that helper and not a preference
  of this panel. The same is true of the 62-day threshold: a product decision that sits in the
  calendar module. Changing either is a shared-helper change with a shared-helper blast radius.
  The cap guards the **dense path only**, since that is the only path that enumerates buckets;
  the sparse path builds its series from the grouped keys and is bounded by the data instead.
  It is needed because the fallback to months divides the point count without bounding it: a
  millennium-wide range is still ~12k monthly points. Past the ceiling the series is silently
  cut short rather than rejected, matching how this module already answers an inverted range
  instead of raising a 422. **Buckets are enumerated ascending, so truncation keeps the
  oldest points and drops the most recent ones** — the counterintuitive half for a revenue
  chart, and worth knowing before trusting a very wide range. Because daily granularity is
  itself bounded at 62 buckets and hourly at 24, the cap can only ever bite at monthly
  granularity, i.e. on a
  closed range wider than ~50 years.
- **⚠️ The enumeration loop must compare instants, not formatted dates.** Past year 9999
  luxon emits the expanded form (`+010000-01-01`), where `+` sorts below every digit, so a
  lexicographic guard never turns false and the loop never ends. The helper carries no comment
  saying so — what holds the line is its own regression test, which walks a range to `9999-12-31`
  and asserts the ceiling truncates. Do not reimplement bucket enumeration in a module, and do
  not "simplify" that comparison back to a formatted string. The sparse path's `.sort()` over
  the same key format is **not** the same hazard and is correct as it stands: it only ever sees
  keys derived from real delivery stamps, never a cursor walking past the 4-digit era.
- **Granularity and density are separate rules with different triggers.** Density is
  *dense* — empty buckets emitted as zeros — only when both bounds are present, at whatever
  granularity; sparse otherwise, carrying only buckets that had a delivery. Both happen to
  depend on the range being closed, which is why they read as one rule and are not: changing
  the 62-day span does not touch zero-filling, and vice versa.
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
- **`totals` is the sum of `series`, unconditionally — except under truncation.** Both halves
  reduce the same fetched rows, and every fetched row now carries a stamp, so each one lands
  in exactly one bucket whether the series is dense or sparse. The **cap is the only way the
  equality breaks**: a truncated series drops buckets whose orders still count in `totals`.
  Do not reintroduce a path where a row counts in the aggregate without belonging to a bucket
  — that asymmetry is what the query filter exists to prevent.
  **The invariant covers the three summable figures only.** `couponDiscountPercentage` is
  recomputed from each half's own gross, so it is neither the sum of the points nor their
  average — a day of 50% beside a day of 0% with ten times the revenue is ~5% for the
  period, not 25%. Averaging the buckets would weight a quiet day like a busy one; there is
  no per-bucket figure to recompose the period's from, and there does not need to be, since
  both are derived from sums that do reconcile.
- **An inverted range yields an empty series**, consistent with the zeros it already answers.
  That takes an explicit guard: without one, an inversion *within a single bucket* collapses
  both bounds onto the same `startOf(...)` and emits one zeroed point, so the answer would
  depend on whether the inversion happened to cross a boundary. It is the guard, not the loop,
  that makes the case uniform.
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
  ⚠️ The key format is currently written out at **two sites** in the helper — the grouping loop
  and the dense cursor loop — and nothing enforces that they agree. If they drift, nothing
  throws: enumerated keys stop matching grouped ones and **the whole series comes back zeroed
  with the right labels**. The zero-fill test is what catches it, incidentally rather than by
  design. Change one site and you must change the other.
- **The key cannot be the label, and that is why there are two of them.** The sparse path
  orders buckets by sorting the keys as strings, so the key has to sort chronologically —
  `["01/09", "26/08"].sort()` puts September first, and `Agosto` sorts before `Julho`.
  Collapsing the two into one field scrambles the chart on exactly the path that has no
  bounds to enumerate from.
- **One reducer feeds both halves.** The same private sums `totals` and every bucket, and the
  same private derives the percentage from those sums, which is what makes them arithmetically
  identical *by construction* rather than by two implementations agreeing. The derivation is a
  wrapper around the reducer rather than a fourth accumulator: a ratio cannot be accumulated
  row by row, so it is computed once per half, from that half's finished sums. It is the same argument as sharing the `where` object on the performance reading:
  restating the sum per half is how they start to drift.
- **The calendar work lives in the shared date helper, not here.** Resolving the unit,
  counting inclusive days, formatting the label and — inside a single grouping function —
  keying an instant to its bucket and enumerating a range are calendar concerns with no notion
  of an order, so they sit next to the zone string that already owned `America/Sao_Paulo`.
  This module hands that function the rows and the range and reduces what comes back; it
  imports luxon nowhere.
- **The adaptive granularity shrinks the series; the ceiling is what bounds it.** Falling
  back to months divides the point count by ~30 — an absurd range (1900–2100) drops from
  ~73k daily points to ~2400 monthly ones, still four times the ceiling — but it does not
  bound anything on its own, which is why the explicit cap exists above it. The unbounded `findMany` remains the heavier
  limit, and neither guard touches it.

### Coupling to watch

Nothing reconciles across the two endpoints — not the counters, not the money, and not the
two lower halves, which are different kinds of breakdown over different universes. They
share only the range semantics and the private that builds it. Adding a figure to one is
never a reason to add it to the other.

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — it takes no argument, unlike the store and delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered for this module because it has no not-found or conflict path |
| No response DTO | Like the rest of the admin surface, there is no `@Serialize` layer — the service hand-maps its result and that mapping *is* the contract |
| `dtos/` holds only what a handler receives | The query DTO is where the range params are declared and validated, never in the service. There is still no *response* DTO. **One DTO per handler**, even when two are field-for-field identical: they are free to diverge, and a shared base is what a third range-filtered endpoint would earn, not the second |
| Date params are parsed, never adjusted | `@Type(() => Date)` parses and `@IsDate()` rejects what came out `Invalid` (→ 422) — and that is the whole treatment. No `@Transform`, no timezone helper, no day boundary: the instant the client sent is the instant that reaches the query. The nearest thing to a counter-example is the coupon DTOs' *end* bound, which does snap (their start bound only carries a floor), and the difference is intentional — a coupon window is a calendar rule the store owns, a dashboard range is a question the caller is asking |
| Filtering is zone-blind; bucketing is not | The rule above governs the **`where`** and is unconditional. Grouping rows into named periods is a different problem — a calendar day only exists in some zone — and the revenue series resolves it in `America/Sao_Paulo`, in the service, never in the DTO. Keep the two apart: a zone leaking into a bound is a period silently changing meaning, and a bucket without one is an evening plotted on the wrong day |
| Sums are accumulated; ratios are derived from them | A figure that adds up rides the reducer that feeds both halves. A figure that does not — the revenue percentage — is computed from the finished sums of each half, never accumulated per row and never carried over from `totals` to a bucket. That is also why it is the one revenue field that can answer `null` |
| A formatted label is the exception, not the pattern | Response fields here are raw values the client formats. The series' `label` is the one that ships display-ready, in pt-BR, because it exists to be rendered on an axis — which also makes its format part of the contract. Do not generalize it to other fields, and do not add a second formatted field without deciding it is worth the same lock-in |
| Counters come from one read; the averages earn a second *(performance reading)* | Never issue a second query for a total that the existing `groupBy` can reduce. The averages are the one thing it cannot: a grouped average needs a numeric column, and the span between two timestamps is not one, so they get a read of their own. That read **reuses the same `where` object** and only narrows it by the dispatch stamp — rebuilding the filter, in another shape or another language, is exactly how the two halves stop describing the same orders |
| The spans are averaged in the service, not in SQL *(performance reading)* | Raw SQL could aggregate them in the database, but it would restate the two-branch `OR` and the optional range a second time. Sharing the `where` object literally is what makes drift impossible. The price is the row fetch: it takes no `take`, and the default period is lifetime, so it grows with every order ever dispatched — the missing backfill holds the count down today but that bound expires by one day per day, and nothing will signal the crossing. Cap it or move the aggregation into the database when the volume justifies it, not before |
| Ordering ends on a unique column *(where anything is ordered)* | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. Nothing is sliced, but without the tiebreaker equal names reshuffle between requests. The `groupBy` needs none — its result is only ever keyed or reduced, never shown in order. Neither does the revenue read: its rows are grouped in memory, and the series is ordered by its own bucket keys, which are unique by construction |
| The range is built once, in a shared private | Both readings derive their date filter from the same private, which returns `undefined` when neither bound is sent so the key drops from the `where` entirely. Restating the range per endpoint is how two panels start disagreeing about what a period means |
| Mapping lives in the service | There is no `helpers.ts` here, unlike the sibling resource modules: the aggregation and the row mapping are private methods fed by the shared query result. Add the file only when something outside the service needs the shape |
| `id` is read but not returned | The service selects `id` to key the count map and drops it from the response. Exposing it is a one-line change if a client needs a stable row key |
| The roster is scoped by the counts, not the reverse | `deliveryPerson.findMany` runs after the `groupBy` and takes its ids. Anything that needs a person absent from the groups needs a second query, not a widened `where` here |
