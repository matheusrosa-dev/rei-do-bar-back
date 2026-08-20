# AGENTS.md — src/apps/admin/notifications/

## What belongs here

Admin push-notification delivery: a broadcast endpoint for sending a notification to a target audience, the history of those manual broadcasts (persisted and listed here), plus a listener that notifies customers about order status changes. Delivery goes through the shared Expo notifications service.

## What does NOT belong here

- The Expo transport itself and token handling primitives → the shared Expo notifications module.

---

## Core Patterns

- **Broadcast**: the **service** resolves the target audience to a set of push tokens and hands the payload to the shared Expo service. Every target shares a base filter (active, non-deleted customers with at least one push token); `resolveTargetWhere` maps the enum value to the extra `Prisma.CustomerWhereInput` for that segment (e.g. `NO_ORDERS`, `ABANDONED_CART`, `INACTIVE_30_DAYS`, `SINGLE_ORDER`), which is spread into the single `customer.findMany`. `SINGLE_ORDER` is the one segment that can't be expressed as a plain `where` — it runs an `Order.groupBy` with `having` first to find customers with exactly one delivered order. Thresholds (e.g. the 30-day inactivity window) are constants in `helpers.ts`, not DTO parameters — adding a segment means adding an enum value and a `switch` case, not changing the request shape. The **controller deliberately does not `await`** it — that is what makes the dispatch fire-and-forget, and it is why the endpoint always responds with an empty body regardless of delivery outcome. The service itself wraps the whole thing in a try/catch and logs a failure rather than throwing, so an un-awaited rejection can never surface as an unhandled rejection.
- **Broadcast history**: every manual broadcast writes exactly one `Notification` row **after** the send attempt, carrying the payload (target, title, description, action), how many customers the segment resolved to **that already hold a push token**, and the final status (`SENT`, or `FAILED` when the send threw — in which case the count may be 0 because the failure happened before resolution). `SENT` means the attempt completed without an exception, not that Expo delivered anything: the transport drops invalid tokens silently and discards the per-message tickets, so the status must never be presented as proof of delivery. The write sits in its own try/catch that only logs: recording the dispatch must never break the fire-and-forget contract. The **order status listener deliberately writes nothing** — the history is a log of what the admin sent by hand, not of every push the system emits.
- **Listing**: `findAll` paginates the history newest-first with optional multi-value `target`/`status` filters, ending the ordering on `id` so pages stay stable; it returns the standard `items` + `meta` shape and the rows whole.
- **Enums live in the schema**: `NotificationTarget`, `NotificationAction`, and `NotificationStatus` are Prisma enums; `helpers.ts` and `@shared/types/notifications` only re-export the generated ones, so a new segment means adding the value in `prisma/schema.prisma` (plus a migration) and a `switch` case here.
- **Order status listener**: reacts to the order status-updated event, maps the new status to a pt-BR title/body, and pushes only to the affected customer's tokens. Pending produces no copy and returns early — only preparing, shipped, delivered, and cancelled notify. It **logs and never throws** on delivery failure, so a notification problem cannot break the order flow.
- **Shared transport**: all sending goes through the injected Expo notifications service; this sub-module never talks to the Expo SDK directly.

---

## Conventions

| Rule | Detail |
|---|---|
| Fire-and-forget broadcast | Sending must not block the HTTP response (the controller leaves the promise un-awaited) |
| Never throw on send failure | Both the broadcast service and the listener catch and log; a failed push must never propagate |
| The history write never breaks the dispatch | The `Notification` create is guarded by its own try/catch with a log — a persistence failure must not surface from the un-awaited broadcast |
| Only manual broadcasts are recorded | The order status listener does not write history |
| Use the shared Expo service | No direct Expo SDK usage here |
| pt-BR copy | All notification titles/bodies are Portuguese |
