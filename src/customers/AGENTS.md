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

Customer creation on first login runs as an atomic transaction that: creates the customer record, migrates the existing anonymous cart to that customer (clearing the anonymous owner and setting the customer owner), and deletes the anonymous record. The cart migration is the critical step that preserves the user's cart across the login boundary — all steps must remain in a single transaction.

---

## Conventions

| Rule | Detail |
|---|---|
| No controller | This is a service-only module; never add routes here |
| Exported service | Consumed via NestJS module imports, not direct instantiation |
| Atomic cross-entity writes | Customer/cart/anonymous changes happen together in one transaction |
