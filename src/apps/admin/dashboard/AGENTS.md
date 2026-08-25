# AGENTS.md — src/apps/admin/dashboard/

## What belongs here

Read-only aggregations for the backoffice dashboard. This module owns no entity: it reads
rows other modules write and returns comparable numbers over them. Every endpoint here is
a `GET`, sits behind the class-level admin-auth composite, and performs no write.

Today it exposes a single reading: delivery-person performance.

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
a set of aggregate counters, and `deliveryPersons`, one entry per delivery person with at
least one closed order in the period. It is not a list endpoint — no pagination, no
configurable sort. It takes exactly two optional query params, `startDate` and `endDate`,
and nothing else. The shape is
deliberately narrow, and widening it is a product decision, not a refactor.

Both halves count the same universe: **orders that reached a delivery person and then
closed**, delivered or cancelled. Every counter on both sides carries the same filters —
a non-null delivery-person assignment, a terminal status, and the date range when one is
given — which is what keeps them reconcilable: the totals are the column-wise sum of the
rows.

Load-bearing decisions:

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
- **A single `groupBy` feeds both halves.** The module groups `order` by
  `["deliveryPersonId", "status"]` once; the per-person half keys the result on
  `` `${id}:${status}` ``, and the totals half reduces the same groups per status. That is
  the primary reason for the shape — a relation `_count` could not serve it, since
  `_count.select` accepts the `orders` relation only once and cannot express several
  differently-filtered counts of it. Adding a status to the panel never costs another query
  — but it is not one edit either: a branch in the `OR`, a counter in the totals builder, a
  field in the row builder, and a decision on whether it belongs inside the summed total all
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
  degrades to exactly the old `in` filter. The single branch on "was a param sent" lives in
  the range builder and returns `undefined`; the `where` clause itself is built once and
  never forks, so one query shape serves both cases.
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

Because both halves derive from one `groupBy`, the totals are the sum of the listed rows by
construction. The date range does **not** threaten that: it narrows the *order* universe,
which both halves share, so both narrow together and still reconcile. The roster `findMany`
narrows with them — its `where` is derived from the group result, never from the delivery
person's own attributes — so it can only drop rows that would have counted zero.

What would break it is a filter on the **roster** that the groups do not imply: active
delivery persons only, a search term, a slice. Those would shrink the listed rows without
shrinking the aggregate, and the totals would then have to move to a `groupBy` of their own
— or, worse, silently start reporting a subset while claiming to be the whole.

The two reads (`groupBy` for the counts, then `findMany` for the roster) run **outside** a
transaction — the same looseness the sibling listing in `admin/delivery-persons/` accepts
between its roster and its counts, though that one does wrap its roster and its total in a
`$transaction` pair.

Both halves still come from the one grouping, so they can never contradict each other, and
under this ordering **no interleaving skews them either** — an invariant worth relying on
rather than defending against. Every id in the groups has at least one order attached, and
such a delivery person cannot vanish between the reads: the FK is `onDelete: Restrict` and
`admin/delivery-persons/` refuses the deletion with `DELIVERY_PERSON_HAS_ORDERS`. Nothing in
`src/` deletes an order either, so the roster read always resolves every id the grouping
produced. (The previous ordering — roster first — did have a window, where a delivery person
created and credited with a whole closed delivery in between landed in `totals` with no row
of their own.)

The status filter is load-bearing, not a formality: an assigned order sitting in `SHIPPED`
is excluded from every counter on purpose, so "orders that reached a delivery person" means
*and have since closed*. Both halves apply the same filter, so they stay reconcilable with
each other — but neither reconciles against the raw count of assigned orders, and they will
not, as long as anything is in transit.

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level `@AdminAuth()` — it takes no argument, unlike the store and delivery composites |
| Read-only | `GET` handlers only; no `AppException` codes are registered for this module because it has no not-found or conflict path |
| No response DTO | Like the rest of the admin surface, there is no `@Serialize` layer — the service hand-maps its result and that mapping *is* the contract |
| `dtos/` holds only what a handler receives | The query DTO is where the range params are declared and validated, never in the service. There is still no *response* DTO |
| Date params are parsed, never adjusted | `@Type(() => Date)` parses and `@IsDate()` rejects what came out `Invalid` (→ 422) — and that is the whole treatment. No `@Transform`, no timezone helper, no day boundary: the instant the client sent is the instant that reaches the query. The nearest thing to a counter-example is the coupon DTOs' *end* bound, which does snap (their start bound only carries a floor), and the difference is intentional — a coupon window is a calendar rule the store owns, a dashboard range is a question the caller is asking |
| Aggregate and detail come from one read | Never issue a second query for a total that the existing `groupBy` can reduce |
| Ordering ends on a unique column | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. Nothing is sliced, but without the tiebreaker equal names reshuffle between requests. The `groupBy` needs none — its result is only ever keyed or reduced, never shown in order |
| Mapping lives in the service | There is no `helpers.ts` here, unlike the sibling resource modules: the aggregation and the row mapping are private methods fed by the shared query result. Add the file only when something outside the service needs the shape |
| `id` is read but not returned | The service selects `id` to key the count map and drops it from the response. Exposing it is a one-line change if a client needs a stable row key |
| The roster is scoped by the counts, not the reverse | `deliveryPerson.findMany` runs after the `groupBy` and takes its ids. Anything that needs a person absent from the groups needs a second query, not a widened `where` here |
