# AGENTS.md — src/admin/notifications/

## What belongs here

Admin push-notification delivery: a broadcast endpoint for sending a notification to a target audience, plus a listener that notifies customers about order status changes. Delivery goes through the shared Expo notifications service.

## What does NOT belong here

- The Expo transport itself and token handling primitives → the shared Expo notifications module.

---

## Core Patterns

- **Broadcast**: the **service** resolves the target audience to a set of push tokens and hands the payload to the shared Expo service. Every target shares a base filter (active, non-deleted customers with at least one push token); `resolveTargetWhere` maps the enum value to the extra `Prisma.CustomerWhereInput` for that segment (e.g. `NO_ORDERS`, `ABANDONED_CART`, `INACTIVE_30_DAYS`, `SINGLE_ORDER`), which is spread into the single `customer.findMany`. `SINGLE_ORDER` is the one segment that can't be expressed as a plain `where` — it runs an `Order.groupBy` with `having` first to find customers with exactly one delivered order. Thresholds (e.g. the 30-day inactivity window) are constants in `helpers.ts`, not DTO parameters — adding a segment means adding an enum value and a `switch` case, not changing the request shape. The **controller deliberately does not `await`** it — that is what makes the dispatch fire-and-forget, and it is why the endpoint always responds with an empty body regardless of delivery outcome. The service itself wraps the whole thing in a try/catch and logs a failure rather than throwing, so an un-awaited rejection can never surface as an unhandled rejection.
- **Order status listener**: reacts to the order status-updated event, maps the new status to a pt-BR title/body, and pushes only to the affected customer's tokens. Pending produces no copy and returns early — only preparing, shipped, delivered, and cancelled notify. It **logs and never throws** on delivery failure, so a notification problem cannot break the order flow.
- **Shared transport**: all sending goes through the injected Expo notifications service; this sub-module never talks to the Expo SDK directly.

---

## Conventions

| Rule | Detail |
|---|---|
| Fire-and-forget broadcast | Sending must not block the HTTP response (the controller leaves the promise un-awaited) |
| Never throw on send failure | Both the broadcast service and the listener catch and log; a failed push must never propagate |
| Use the shared Expo service | No direct Expo SDK usage here |
| pt-BR copy | All notification titles/bodies are Portuguese |
