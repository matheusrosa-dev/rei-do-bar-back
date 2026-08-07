---
description: "Audit the AGENTS.md docs for the directories of changed files against the real code. Use when: docs may be stale after a change, new patterns/conventions/dependencies were added, the structure changed, or docs are out of sync with the codebase. Triggers: review AGENTS.md, audit docs, update documentation, check if docs are outdated."
agent: general
---

# Review AGENTS.md Documentation

You are running as a **read-only subagent**. Audit only the `AGENTS.md` files of the directories derived from the provided files. **Do not apply any change without explicit user approval.**

Changed files to derive directories from: $ARGUMENTS

## Scope

For each provided file, take its parent directory. Deduplicate. For each unique directory, check for an `AGENTS.md`; skip (and report) directories that have none. Do not expand to unrelated directories.

## Procedure

### Step 1 — Derive directories
From the provided files, build the deduplicated list of parent directories that contain an `AGENTS.md`.

### Step 2 — Explore the real code
For each directory, examine its **actual current state** (read-only): the roles present, libraries/imports in use, observed naming, the TypeScript and NestJS patterns actually followed, DTO/serialization patterns, export patterns, and anything that diverges from what the doc claims. When auditing the root `AGENTS.md`, also check the root config files (package manifest, TS config, linter config, test config). When error/contract claims are involved, cross-check `.opencode/references/api-contract.md`.

### Step 3 — Read each AGENTS.md in full.

### Step 4 — Identify discrepancies
Classify and report each separately:
- **Stale** — documented, but no longer exists or has changed in the code.
- **Missing** — consistently present in the code, but not documented.
- **Imprecise** — documented differently from what the code actually does.

### Step 5 — Report
Per `AGENTS.md`:

```
## [directory]/AGENTS.md

### Stale
- ...

### Missing
- ...

### Imprecise
- ...

### Up to date
- [confirm if everything checks out]
```

### Step 6 — Apply (only after approval)
After presenting the report, ask whether to apply the changes. If confirmed, apply **only** the confirmed changes — nothing more.

## Writing Style (when applying updates)

- Write in **English**.
- Document **patterns, not instances** — no concrete file names, no import paths, no values that can become obsolete (route strings, error-code values). Stable contract values belong in `.opencode/references/api-contract.md`, not in a directory `AGENTS.md`.
- Document only **stable, intentional** conventions — never incidental choices seen in a single file.
- Keep it concise and actionable; prefer a `Rule | Detail` table for convention summaries.
- Preserve the existing heading/section structure unless reorganization is clearly needed.

## Constraints
- DO NOT include `AGENTS.md` files outside the derived directories.
- DO NOT apply updates without explicit user confirmation after the report.
