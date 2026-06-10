# AGENTS.md — src/shared/exceptions/

## The Application Exception

This directory defines the **only** exception class used in application code. It extends the framework's HTTP exception and carries a stable error **code**, a user-facing **message**, and an **HTTP status**. The framework's status enum is re-exported from the class, so call sites do not import it separately.

Error codes are organized into a static registry, namespaced by domain. New failure cases must register a code in that registry **before** it is thrown. The registry's concrete code values are the API's error contract and are catalogued in `.claude/references/api-contract.md` — do not duplicate the value list here, where it would drift.

## Error Response Shape

The global exception filter converts every HTTP exception into a `{ code, message }` body and uses a generic internal-error code/message for unexpected (non-HTTP) errors. The exact shapes are in the API contract reference.

---

## Conventions

| Rule | Detail |
|---|---|
| Never throw raw `Error` | Use the application exception for every expected failure path |
| Never throw the framework `HttpException` directly | Use the application exception so the `code` field is always present |
| Messages in pt-BR | User-facing strings are Portuguese |
| Status via the class re-export | Use the re-exported status enum rather than importing it separately |
| Register before throwing | Add the code to the registry before using it, and document the value in the API contract reference |
