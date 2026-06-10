---
description: 'Independent code review of changed files in the Rei do Bar backend. Use when: reviewing changed files, checking for bugs, TypeScript errors, NestJS pattern misuse, DTO validation/serialization issues, guard/interceptor misuse, Prisma/transaction problems, missing or wrong error codes, security issues, or validating a finished implementation.'
argument-hint: 'List the files changed and what was implemented (e.g. "added order cancellation in src/orders/orders.service.ts and src/orders/dtos/cancel-order.dto.ts")'
---

# Review Changes

Run as a **fresh, independent subagent** with no access to the implementing conversation. Review **only** what is passed; do not infer, expand, or pull in unrelated files. **Never edit any file — report only.**

## Procedure

1. **Receive the changed files** and the short description of what was implemented.
2. **Read directory conventions** — for every directory involved, read its `AGENTS.md`; always read the root `AGENTS.md` first, and `.claude/references/api-contract.md` for the response/error/pagination contract.
3. **Read each provided file in full.** Load related types/interfaces only for context — do not add them to the reviewed list.
4. **Analyze each file strictly against the documented conventions** for its scope (the checklist below).
5. **Group findings** as Critical / Warning / Suggestion (definitions below).
6. **Return the structured report.** Do not edit files; do not implement fixes.

## Severity

- **Critical** — broken contract, bug, security risk, or a violation of a structural project convention. Must fix.
- **Warning** — style inconsistency, a pattern applied incompletely, or a decision that will accrue debt. Should fix.
- **Suggestion** — optional improvement with no immediate impact.

## Checklist

**Correctness & types**
- No unintentional implicit `any`; types reflect actual shapes; logic handles edge cases (empty cart, missing relations, the anonymous/customer session duality).
- No nested ternaries; no dead code (unused imports/variables, unreachable branches).

**NestJS structure**
- Correct module/controller/service decorators; dependency injection via the constructor only (no manual instantiation); guards and interceptors applied at the right scope (class vs. method).

**DTOs & serialization**
- Input DTOs validate with class-validator; response DTOs expose fields intentionally and declare nested types; the serialize decorator is applied at controller class level.

**Validation & input handling**
- Every external input is validated; identifiers are typed as UUIDs; params vs. body are sourced as the surrounding code does.

**Error handling**
- Only `AppException` is thrown (never raw `Error`/`HttpException`); the code is registered in the registry and documented in the API contract reference; messages are pt-BR; HTTP status fits the failure.

**Security**
- Authorization is enforced (ownership checks scope queries by the session's customer id; admin routes use the admin-auth composite); no secrets or PII leak into responses or logs; no raw/unparameterized SQL built from user input; toggle/identity responses don't expose extra fields.

**Data & transactions**
- Multi-step writes that must be atomic run inside a single transaction; concurrency-sensitive flows use the established locking/guarded-update patterns; queries select/include explicitly (no over-fetching); known Prisma errors are translated to `AppException`.

**API contract**
- Response shape matches the envelope/serialization contract; list endpoints follow the pagination contract; no breaking change to an existing contract without it being called out.

**Config**
- No direct `process.env` access in application code; config read via `ConfigService` with typed namespaces.

**Conventions**
- Kebab-case filenames; named exports; `dtos/index.ts` barrels updated; `@shared/` alias used (no deep relative paths); user-facing strings in pt-BR.

## Report Format

```
## Code Review

### Files reviewed
- path/to/file.ts

### Critical (must fix)
- [file:line] What is wrong and why it matters

### Warning (should fix)
- [file:line] What is wrong

### Suggestion (optional)
- [file:line] The improvement

### Summary
1–2 sentence overall assessment.
```

If nothing is wrong, say so explicitly.

## Constraints
- DO NOT edit files or implement fixes — only describe them.
- DO NOT approve changes without reading the actual file contents.
- DO NOT review files that were not explicitly provided.
