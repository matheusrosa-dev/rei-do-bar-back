---
description: "Audit the AGENTS.md docs for the directories of changed files against the real code. Use when: docs may be stale after a change, new patterns/conventions/dependencies were added, the structure changed, or docs are out of sync with the codebase. Triggers: review AGENTS.md, audit docs, update documentation, check if docs are outdated."
argument-hint: "Required: one or more files that were changed (e.g. src/apps/store/me/me.service.ts src/apps/store/me/dtos/add-address.dto.ts)"
model: claude-haiku-4-5-20251001
---

# Review AGENTS.md Documentation

Run as an **autonomous subagent**. Audit only the `AGENTS.md` files of the directories derived from the provided files, then **apply the corrections yourself**. Do not ask for approval and do not hand the edits back to the calling agent — you own the documentation changes end to end.

## Scope

For each provided file, take its parent directory. Deduplicate. For each unique directory, check for an `AGENTS.md`; skip (and report) directories that have none. Do not expand to unrelated directories.

## Procedure

### Step 1 — Derive directories
From the provided files, build the deduplicated list of parent directories that contain an `AGENTS.md`.

### Step 2 — Explore the real code
For each directory, examine its **actual current state** (read-only): the roles present, libraries/imports in use, observed naming, the TypeScript and NestJS patterns actually followed, DTO/serialization patterns, export patterns, and anything that diverges from what the doc claims. When auditing the root `AGENTS.md`, also check the root config files (package manifest, TS config, linter config, test config). When error/contract claims are involved, cross-check `.claude/references/api-contract.md`.

### Step 3 — Read each AGENTS.md in full.

### Step 4 — Identify discrepancies
Classify and report each separately:
- **Stale** — documented, but no longer exists or has changed in the code.
- **Missing** — consistently present in the code, but not documented.
- **Imprecise** — documented differently from what the code actually does.

### Step 5 — Apply the corrections
Edit each affected `AGENTS.md` directly, fixing every Stale, Missing, and Imprecise item found. Change **only** the documentation files of the derived directories — never touch source code, and never touch an `AGENTS.md` outside that list.

### Step 6 — Report what was applied
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

Each item states what was found and how it was fixed in the file.

## Writing Style (when applying updates)

- Write in **English**.
- Document **patterns, not instances** — no concrete file names, no import paths, no values that can become obsolete (route strings, error-code values). Stable contract values belong in `.claude/references/api-contract.md`, not in a directory `AGENTS.md`.
- Document only **stable, intentional** conventions — never incidental choices seen in a single file.
- Keep it concise and actionable; prefer a `Rule | Detail` table for convention summaries.
- **Size budget**: a directory `AGENTS.md` should stay around ~200 lines. Pushing past that is a signal the module needs a table, not more prose — flag it as a Warning rather than adding another paragraph. A fact that keeps recurring in the file gets **one** home, referenced from the others, never restated.
- **State, not history**: document the module as it is today, never its trajectory. Reject/flag phrasing like "used to", "no longer", "was moved/removed", "there were N readings until X" — where the history existed to guard against a regression, replace it with a one-line imperative rule instead (e.g. "Do not re-add `totalOrdersCount` — the caller sums the two columns").
- **Parent points, child owns**: a parent-directory `AGENTS.md` documents only what is common across its sub-modules and links to each child's `AGENTS.md` for specifics. It never restates a child's contract (field lists, endpoint shapes, per-resource rules) — that duplication is what goes stale first.
- Preserve the existing heading/section structure unless reorganization is clearly needed.

## Constraints
- DO NOT include `AGENTS.md` files outside the derived directories.
- DO NOT modify any file that is not an `AGENTS.md` of a derived directory.
- DO NOT ask for approval — apply the corrections and report them.
