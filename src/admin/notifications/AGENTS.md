# AGENTS.md — src/admin/notifications/

## What belongs here

Admin push-notification delivery: a broadcast endpoint for sending a notification to a target audience, plus a listener that notifies customers about order status changes. Delivery goes through the shared Expo notifications service.

## What does NOT belong here

- The Expo transport itself and token handling primitives → the shared Expo notifications module.

---

## Core Patterns

- **Broadcast**: the controller resolves the target audience to a set of push tokens (e.g. all active customers) and hands the payload to the shared Expo service. The dispatch is fire-and-forget — the request does not block on delivery.
- **Order status listener**: reacts to the order status-updated event, maps the new status to a pt-BR title/body, and pushes only to the affected customer's tokens. It returns early when there is nothing to send and **logs (never throws)** on delivery failure, so a notification problem cannot break the order flow.
- **Shared transport**: all sending goes through the injected Expo notifications service; this sub-module never talks to the Expo SDK directly.

---

## Conventions

| Rule | Detail |
|---|---|
| Fire-and-forget broadcast | Sending must not block the HTTP response |
| Never throw on send failure | Listener failures are logged, not propagated |
| Use the shared Expo service | No direct Expo SDK usage here |
| pt-BR copy | All notification titles/bodies are Portuguese |
