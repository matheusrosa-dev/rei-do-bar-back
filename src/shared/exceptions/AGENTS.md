# AGENTS.md — src/shared/exceptions/

## The Application Exception

This directory defines the **only** exception class used in application code. It extends the framework's HTTP exception and carries a stable error **code**, a user-facing **message**, and an **HTTP status**. The framework's status enum is re-exported from the class, so call sites do not import it separately.

Error codes are organized into a static registry, namespaced by domain. New failure cases must register a code in that registry **before** it is thrown. The registry's concrete code values are the API's error contract and are catalogued in `references/api-contract.md` (`.claude/references/api-contract.md` for Claude Code, `.opencode/references/api-contract.md` for opencode) — do not duplicate the value list here, where it would drift.

A namespace mirrors the **resource** the code describes, not necessarily the module that throws it — an admin-only resource belongs to its own `admin`-prefixed namespace even when a *different* admin module throws that code on the resource's behalf. Example: `adminDeliveryPersons.DELIVERY_PERSON_NOT_FOUND` / `_INACTIVE` are thrown both by the delivery-persons module and by the orders module (validating the delivery person being assigned on the `SHIPPED` transition or the reassignment endpoint) — the code stays defined once, under the resource it names, not duplicated into `adminOrders`.

Retiring a code means deleting it from the registry and from the contract reference; the number it occupied is **never reused**, so numbering gaps within a namespace are intentional. The only moment renumbering is acceptable is while a namespace is still being introduced and none of its codes have shipped.

## Error Response Shape

The global exception filter converts every HTTP exception into a `{ code, message }` body. Two of the three shapes it can emit do **not** come from the application exception, and clients must handle them:

| Origin | Shape |
|---|---|
| An `AppException` | `{ code: "DOMAIN_NNN", message: "<pt-BR string>" }` with the declared status |
| An HTTP exception with no `code` — chiefly the global `ValidationPipe` | `{ code: "UNKNOWN", message: [ ...class-validator messages ] }` with **422**; note `message` is an **array** here, not a string |
| Any unexpected (non-HTTP) error | `{ code: "INTERNAL_ERROR", message: "Erro interno do servidor" }` with 500 |

The exact shapes are catalogued in the API contract reference.

---

## Conventions

| Rule | Detail |
|---|---|
| Never throw raw `Error` | Use the application exception for every expected failure path |
| Never throw the framework `HttpException` directly | Use the application exception so the `code` field is always present |
| Messages in pt-BR | User-facing strings are Portuguese |
| Status via the class re-export | Use the re-exported status enum rather than importing it separately |
| Register before throwing | Add the code to the registry before using it, and document the value in the API contract reference |
| Namespace follows the resource | An admin-only resource gets an `admin`-prefixed namespace and code prefix; a different module throwing that resource's code reuses the same namespace rather than duplicating it into its own |
| Retired numbers are never reused | Deleting a code leaves an intentional gap in its namespace |
