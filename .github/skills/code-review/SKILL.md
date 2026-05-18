---
name: code-review
description: 'Review code changes in the Rei do Bar app. Use when: reviewing changed files, checking for bugs, TypeScript errors, NestJS best practices, DTO validation/serialization issues, guard or interceptor misuse, Prisma query problems, missing error codes, or validating a finished implementation.'
argument-hint: 'List the files changed and what was implemented (e.g. "added addAddress endpoint in src/me/me.controller.ts and src/me/me.service.ts")'
---

# Code Review

## Scope
Only review files or directories that are **explicitly provided**. Do not infer, expand, or include additional files beyond what was passed.

## What to Review

For each changed file, analyze:
1. **TypeScript correctness** — no unintentional implicit `any`, proper typing, `import type` for type-only imports
2. **NestJS patterns** — correct use of `@Injectable()`, `@Controller()`, `@Module()`; DI via constructor injection only; no direct instantiation of services; guards and interceptors applied at the right scope (class vs. method)
3. **DTO conventions** — input DTOs use `class-validator` decorators; response DTOs use `@Expose()` on every returned field and `@Type(() => NestedDto)` for nested objects; `@Serialize(Dto)` applied at the controller class level
4. **Error handling** — all expected failures throw `AppException` with a code registered in `AppException.errorCodes`; no raw `new Error()` or `new HttpException()`; user-facing messages in pt-BR
5. **Config access** — `process.env` is never read directly in application code; config always accessed via `ConfigService.get<IType>("namespace")`
6. **Prisma usage** — queries use `select` or `include` explicitly (no over-fetching); transactions (`$transaction`) used for multi-step writes that must be atomic
7. **Logic correctness** — no off-by-one errors, edge cases covered, anonymous/customer session duality handled correctly where applicable
8. **Naming & exports** — files and directories in kebab-case; named exports everywhere; `dtos/index.ts` barrel re-exports all DTOs in the directory
9. **Path aliases** — `@shared/` used for all imports from `src/shared/`; no relative `../../../shared/` paths
10. **Dead code** — unused imports, variables, or unreachable branches

## Procedure

### 1. Read directory conventions
Before reviewing files in any directory, read the `AGENTS.md` in that directory if one exists. Always read the root `AGENTS.md` first.

### 2. Read every provided file
Read the full content of each file or directory explicitly passed. If a directory is provided, read all source files (`.ts`, `.tsx`) within it.

### 3. Read related files for context
Load relevant interfaces, types, or sibling components when needed to understand the code — but do NOT add them to the "Files reviewed" list.

### 4. Identify issues by severity
Group findings as **Critical**, **Warning**, or **Suggestion**.

### 5. Return the structured review

```
## Code Review

### Files reviewed
- path/to/file.tsx

### Critical (must fix)
- [file:line] Description of the issue and why it's a problem

### Warning (should fix)
- [file:line] Description of the issue

### Suggestion (optional improvement)
- [file:line] Description of the suggestion

### Summary
Overall assessment in 1-2 sentences.
```

If no issues are found, explicitly confirm the code looks good.

## Constraints
- DO NOT edit any files
- DO NOT implement fixes — only describe them
- DO NOT approve changes without reading the actual file contents
- DO NOT review files that were not explicitly provided