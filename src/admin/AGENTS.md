# AGENTS.md — src/admin/

## What belongs here

The admin backoffice, protected by HTTP Basic Auth. Each managed resource (products, categories, customers, orders) is its own NestJS sub-module that mirrors the standard module/controller/service/`dtos` layout. Operations include catalog management, stock control, activation/deactivation, guarded deletion, and read-only order listing.

## What does NOT belong here

- Client-facing product or category listing → the respective client feature modules.
- Customer self-management → the authenticated customer module.
- Customer order placement and cancellation → the client orders module.

---

## Authentication

All admin controllers apply the admin-auth composite decorator **at class level**. It marks routes as public (bypassing the global device-id guard and any JWT guard) and then enforces the Basic Auth guard, which validates credentials against the admin config namespace. Admin routes therefore require neither an `x-device-id` header nor a JWT.

---

## Core Patterns

- **Paginated listing**: list endpoints accept page/limit plus optional filters, a free-text search term, and optional sort key/direction; they return a normalized page object (items + pagination metadata). See `.claude/references/api-contract.md` for the exact pagination contract.
- **Sorting strategy**: relation counts that Prisma can order on are sorted and paginated at the database level; counts that cannot be expressed as a Prisma `orderBy` are sorted in application memory via a two-step fetch (ids + filtered counts, then full data for the page slice).
- **Creation defaults**: newly created catalog entities start inactive (and products start with zero stock) so they are not exposed to clients until explicitly activated.
- **Activate/deactivate**: implemented through a single shared private helper per resource that translates the Prisma "record not found" error into an `AppException`; toggle responses expose only identity and status fields, never PII.
- **Deletion**: catalog products are **soft-deleted** (deletion timestamp set) and their cart references removed atomically in one transaction; categories and customers are **hard-deleted** but only after a pre-check proves no dependent records exist (linked products / existing orders), otherwise a conflict error is thrown. Cascades handle the remaining dependents.
- **Atomic stock mutations**: stock changes use a guarded conditional update (`WHERE stock >= amount`); when zero rows are affected, a follow-up lookup distinguishes "not found" from "insufficient stock".
- **Prisma error translation**: known Prisma error codes (record-not-found, unique-constraint) are caught and converted to domain `AppException`s — they never leak to the client.

---

## Conventions

| Rule | Detail |
|---|---|
| Auth | Class-level admin-auth composite on every admin controller; Basic Auth guard is never registered globally |
| One sub-module per resource | Each managed resource has its own module/controller/service/`dtos` |
| List response shape | Always `items` + pagination metadata; see the API contract reference |
| Read-only resources | Resources without mutations (e.g. order listing) expose only a list endpoint |
| Error handling | Translate Prisma errors to `AppException`; register codes before throwing |
