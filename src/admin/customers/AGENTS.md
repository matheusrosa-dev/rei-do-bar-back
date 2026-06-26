# AGENTS.md — src/admin/customers/

## What belongs here

Admin customer oversight: paginated listing, single-customer read, activation/deactivation, and guarded deletion.

## What does NOT belong here

- Customer self-management (profile, addresses) → the authenticated customer module.
- Customer creation → customers are created through the auth/OTP flow, never here.

---

## Core Patterns

- **Read-only management surface**: this sub-module never creates or edits customer profile data; it only lists, inspects, toggles status, and deletes.
- **Listing**: paginated, with optional filters and free-text search.
- **Activate/deactivate**: a single shared private helper toggles the active flag and translates the Prisma "record not found" error into the resource's `AppException`; toggle responses never expose PII.
- **Deletion**: customers are **hard-deleted**, but only after a pre-check proves no dependent orders exist; on deletion their personal data is scrubbed (anonymization) per the soft-delete/PII convention.
- **Prisma error translation**: known Prisma errors become domain `AppException`s and never leak.

---

## Conventions

| Rule | Detail |
|---|---|
| No profile writes | Admin never mutates customer profile fields |
| Hard delete with pre-check | Block deletion when orders exist |
| PII | Toggle/detail responses must not leak personal data beyond what the surface needs |
