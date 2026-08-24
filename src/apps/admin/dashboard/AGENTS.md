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
a set of aggregate counters, and `deliveryPersons`, one entry per registered delivery
person. It is not a list endpoint — no pagination, no filters, no configurable sort. The
shape is deliberately narrow, and widening it is a product decision, not a refactor.

Both halves count the same universe: **orders that reached a delivery person and then
closed**, delivered or cancelled. Every counter on both sides carries the same two filters —
a non-null delivery-person assignment and a terminal status — which is what keeps them
reconcilable: the totals are the column-wise sum of the rows.

Load-bearing decisions:

- **Every delivery person is listed**, active or not, including those with zero orders.
  A deactivated entregador keeps their history, so filtering on `isActive` would silently
  drop past deliveries from the panel.
- **Lifetime counts, no date window.** This is intentionally *not*
  `getRecentOrdersWindowStart()` — that 10-hour window belongs to the shift counters in
  `admin/delivery-persons/` and `delivery-persons/orders/`. It also avoids the
  `deliveredAt`/`cancelledAt` backfill gap: rows finalized before those columns existed
  carry `NULL` and would vanish from a windowed count.
- **A single `groupBy` feeds both halves.** The module groups `order` by
  `["deliveryPersonId", "status"]` once; the per-person half keys the result on
  `` `${id}:${status}` ``, and the totals half reduces the same groups per status. That is
  the primary reason for the shape — a relation `_count` could not serve it, since
  `_count.select` accepts the `orders` relation only once and cannot express several
  differently-filtered counts of it. Adding a status to the panel never costs another query
  — but it is not one edit either: the `status: { in: [...] }` filter, a counter in the
  totals builder, a field in the row builder, and a decision on whether it belongs inside
  the summed total all have to move together, or the total silently stops matching its parts.
- **The assignment filter is `deliveryPersonId: { not: null }`, not an id list.** It
  expresses the same set as passing every registered id, without a query that grows with
  the roster, and it removes the need for an empty-roster guard: with no delivery persons
  there are no assigned orders, so the `groupBy` returns nothing and every counter reads
  zero on its own.
- **Only terminal statuses are counted.** `DELIVERED` and `CANCELLED` are the two ends of
  the line, so the counters are mutually exclusive buckets and their sum is the total. An
  order still in transit is deliberately absent from every counter — the panel reports
  closed outcomes, not work in progress.
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

Because both halves derive from one `groupBy` scoped to *all* assigned orders, the totals
are the sum of the listed rows by construction. If the listing ever gains a filter (active
delivery persons only, a date range), the totals must move to a `groupBy` of their own —
otherwise they silently start reporting the filtered subset instead of the whole universe.

The two reads (`findMany` for the roster, then `groupBy` for the counts) run **outside** a
transaction — the same looseness the sibling listing in `admin/delivery-persons/` accepts
between its roster and its counts, though that one does wrap its roster and its total in a
`$transaction` pair.

Because the `groupBy` runs second, it sees the newer state, so nothing an in-flight
transition touches can go *uncounted*, and the two halves can never contradict each other
— both come from that one grouping. The single reachable skew runs the other way: a
delivery person created after the roster read, whose first order is assigned **and reaches a
terminal status** before the `groupBy`, lands in `totals` with no row of their own, so the
totals momentarily exceed the listed rows. That is a narrow window — it needs a whole
delivery to close inside it — and it is gone on the next request.

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
| No `dtos/` | The endpoint takes no param, query, or body. Add the directory only when one does |
| Aggregate and detail come from one read | Never issue a second query for a total that the existing `groupBy` can reduce |
| Ordering ends on a unique column | The roster sorts `[{ name: "asc" }, { id: "asc" }]`. Nothing is sliced, but without the tiebreaker equal names reshuffle between requests. The `groupBy` needs none — its result is only ever keyed or reduced, never shown in order |
| Mapping lives in the service | There is no `helpers.ts` here, unlike the sibling resource modules: the aggregation and the row mapping are private methods fed by the shared query result. Add the file only when something outside the service needs the shape |
| `id` is read but not returned | The service selects `id` to key the count map and drops it from the response. Exposing it is a one-line change if a client needs a stable row key |
