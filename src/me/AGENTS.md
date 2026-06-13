# AGENTS.md — src/me/

## What belongs here

Operations a **logged-in customer** performs on their own account:
- Fetching and initializing their profile.
- Updating their name.
- Managing their delivery addresses (add, remove, update, set main).
- Deleting their own account.

## What does NOT belong here

- Admin operations on customers → the admin customers sub-module.
- Anonymous-customer management → the auth module.
- Customer creation → the internal customers service.

---

## Auth Requirement

The entire controller is protected by the access-token guard; there is no public route here. Every service method receives the authenticated customer id from the current session.

---

## Central Pattern

Each service method first calls a private "load me or throw" helper to confirm the customer exists (excluding soft-deleted accounts), optionally including addresses. Mutations then proceed via nested Prisma writes on the customer's relations.

**Address management**:
- Adding an address runs in a transaction that demotes all existing addresses to non-main and creates the new one as main — the newly added address always becomes the main address.
- A duplicate guard checks in memory for an address with the same postal code and number before adding, and a per-customer address-count limit is enforced.
- Removing an address is blocked when it is the customer's only address; when the removed address was the main one (and others remain), the next address is promoted to main in the same write.

**Profile update**: the name is trimmed before validation and must contain a full name; an update with no recognized fields is rejected.

**Account deletion**: deletion is a soft delete by anonymization — the customer row is kept (preserving linked order history) while personal data is scrubbed and the account is marked with a deletion timestamp; personal relations are removed and sessions revoked, all in a single transaction.

---

## DTOs

The response DTO exposes profile fields plus a nested address collection (nested transformation is declared explicitly). Input DTOs validate postal code as a fixed-length digit string and take route-param identifiers as UUIDs.

---

## Conventions

| Rule | Detail |
|---|---|
| Existence check first | Every method starts by resolving the customer or throwing; soft-deleted accounts are treated as non-existent |
| One main address | Address mutations preserve exactly one main address |
| Nested writes | Address changes go through the customer's relation, not a separate address service |
| Errors | Thrown as `AppException`; codes are listed in the API contract reference |
