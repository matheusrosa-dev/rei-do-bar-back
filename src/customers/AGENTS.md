# AGENTS.md — src/customers/

## What belongs here

The internal service layer for customer-entity operations shared across feature modules. This module has **no public HTTP controller** — it exists to expose its service to other modules that import it.

## What does NOT belong here

- Anonymous-customer logic → the auth module.
- Customer self-management (profile, addresses) → the authenticated customer module.
- Any route handler.

---

## Module Design

The module provides and exports its service so other modules can depend on it. It registers no controller and owns no routes.

---

## Central Pattern

This service exposes **two** entry points, both called from the auth module's OTP login, and both ending with the device's anonymous cart belonging to the customer. Which one runs depends on whether the phone number already has a customer:

- **First login (new customer)** — one transaction: create the customer record, hand the anonymous cart over to them (clear the anonymous owner, set the customer owner), delete the anonymous record.
- **Returning customer** — one transaction: **delete the customer's persisted cart** (its items cascade away), then hand the anonymous cart over to them and delete the anonymous record.

The returning-customer path is a **replace, not a merge**. Whatever the customer had saved from a previous session is discarded in favor of what is sitting on the device at login. This is deliberate — the device's cart is what the user was just looking at — but it is destructive, so any change here must keep it explicit rather than quietly turning it into a merge (or quietly keeping the server cart).

Both paths share a private helper for the hand-over step, and all their steps must remain inside a single transaction: a partial failure that deleted the anonymous record without reattaching its cart would lose the user's cart outright.

---

## Conventions

| Rule | Detail |
|---|---|
| No controller | This is a service-only module; never add routes here |
| Exported service | Consumed via NestJS module imports, not direct instantiation (currently only the auth module) |
| Atomic cross-entity writes | Customer/cart/anonymous changes happen together in one transaction |
| Login replaces the cart | The device's anonymous cart wins over the customer's persisted cart — never silently change this to a merge |
