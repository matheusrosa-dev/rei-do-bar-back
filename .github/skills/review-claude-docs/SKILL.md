---
name: review-claude-docs
description: "Reevaluate and audit CLAUDE.md documentation files in the project. Use when: CLAUDE.md files may be outdated, patterns changed, new conventions were added, dependencies were updated, directory structure changed, documentation is stale, or docs are out of sync with the codebase. Triggers: review CLAUDE.md, audit docs, update documentation, check if docs are outdated, CLAUDE.md outdated."
argument-hint: "Required: one or more files that were changed (e.g. src/me/me.service.ts src/me/dtos/add-address.dto.ts)"
---

# Review CLAUDE.md Documentation

## Scope

Only review `CLAUDE.md` files that are **directly relevant to the provided files**. For each provided file, check its parent directory for a `CLAUDE.md`. Do not search for, infer, or expand to other directories. Skip directories that do not contain a `CLAUDE.md` file.

---

## Purpose

Audit the `CLAUDE.md` files of the provided directories against the actual codebase state. Detect:

1. **Stale content** — things documented that no longer exist, are no longer used, or have changed
2. **Missing content** — new patterns, libraries, conventions, or structural decisions not yet documented

---

## When to Use

- After adding or removing dependencies
- After refactoring the folder structure
- After introducing a new coding convention or pattern
- After a significant feature was added that introduced new structural patterns
- Periodically, as a documentation health check
- When something in the codebase feels undocumented

---

## Procedure

### Step 1 — Derive directories from provided files

For each provided file, extract its parent directory. Deduplicate the resulting list. For each unique directory, check whether a `CLAUDE.md` file exists. Skip directories that do not have one and inform the user which were skipped.

### Step 2 — For each CLAUDE.md, explore its scope

Identify the directory the file covers (its parent folder). Use a read-only subagent (Explore) to thoroughly examine the **actual current state** of that directory:

- All files present and their roles
- Libraries and imports in use
- Naming conventions observed in the actual code
- TypeScript patterns actually in use (exports, `import type`, non-null assertions, etc.)
- NestJS patterns (DI, decorators, guard/interceptor scope, module structure)
- DTO patterns (`@Expose()`, `@Type()`, `@Serialize()`, class-validator decorators)
- Export patterns (barrel files, named exports only)
- Any patterns that differ from what the CLAUDE.md describes

Also check root config files (package.json, tsconfig.json, biome.json, jest.config.ts, etc.) when reviewing the root CLAUDE.md.

### Step 3 — Read each CLAUDE.md

Read the full content of each CLAUDE.md file being reviewed.

### Step 4 — Cross-reference: identify discrepancies

Compare the CLAUDE.md content against the actual codebase findings:

**Stale content to flag:**
- Libraries or tools documented that are no longer in `package.json`
- Patterns described that no files actually follow
- Folder structures or naming conventions documented that differ from reality
- Rules that were superseded by new decisions

**Missing content to flag:**
- New libraries added to `package.json` that aren't documented
- New patterns consistently used in code but not described
- New directories or structural additions not reflected
- New conventions observed in multiple files that have no documentation

### Step 5 — Report findings

For each CLAUDE.md reviewed, produce a clear report:

```
## [directory]/CLAUDE.md

### Stale (document says X, but reality is Y)
- ...

### Missing (observed in code, not documented)
- ...

### Up to date
- [confirm if everything checks out]
```

### Step 6 — Apply updates

After showing the report, ask the user if they want to apply the suggested changes. If confirmed:

- Edit the CLAUDE.md files to remove stale content and add the missing documentation
- Follow the same writing style already in each file (same language, same level of detail, no file/path references that could become stale)
- Do not add documentation for things that only appear in one file and may be incidental — only document stable patterns

---

## Key Rules for CLAUDE.md Writing Style

When updating or extending CLAUDE.md files, follow these rules (consistent with the project's established style):

- Write in **English**
- Do **not** reference specific file names, specific import paths, or concrete values — describe patterns, not instances
- Do **not** document incidental code choices — only document stable, intentional conventions
- Keep descriptions concise and actionable; use tables for convention summaries
- Preserve the heading/section structure already in the file unless reorganization is clearly needed

---

## Constraints
- DO NOT search for or include CLAUDE.md files outside the directories derived from the provided files
- DO NOT review a directory not derived from the provided file list, even if it contains a CLAUDE.md
- DO NOT apply updates without explicit user confirmation after the report
