@AGENTS.md

## Rule Zero — Read the AGENTS.md files

Before accessing, creating, or modifying any file inside a directory, you **must** read the `AGENTS.md` file in that directory, if one exists. Also read the root `AGENTS.md` before any task.

The `AGENTS.md` files are the source of truth for the conventions in their respective scopes and take precedence over any inferred pattern. Never assume a convention — always consult the corresponding `AGENTS.md` first.

For the stable API contract (response envelope, error response shape, the error-code registry, and the pagination shape), consult `.claude/references/api-contract.md`.

---

## Hard Constraints

- **NEVER alter the directory structure or create new scaffolding folders/files without first asking the user and receiving explicit confirmation.**
- **NEVER install, remove, or update dependencies without first asking the user.** Present the package and the justification, then wait for approval.
- **NEVER run destructive database commands** (`migrate reset`, `db push`, `db drop`) without explicit user confirmation.
- **NEVER stage or unstage files (`git add`, `git reset`, etc.) on your own initiative.**
- **NEVER run `git commit`.**
- **NEVER run `git push`.**
- Do not over-engineer. Implement exactly what was requested — nothing more.
- Do not add comments, docstrings, or type annotations to code you did not change.
- Do not nest ternaries.
- Comment only when genuinely necessary. If a name doesn't explain itself, rename it before adding a comment.
- Never use `process.env` directly in application code — always access config through `ConfigService.get<IType>("namespace")`.
- Never throw a raw `Error` or the framework `HttpException` — always use `AppException` with a registered error code.
- All user-facing strings (error messages, logs) must be in **Portuguese (pt-BR)**.
- **NEVER create, modify, or delete test files** (`__tests__/`, `*.spec.ts`, `test/`, factories/mocks in `shared/testing/`) unless the user explicitly asks for it in that task. Finishing an implementation is not a reason to write or update tests.
- **NEVER run the test suite** (`npm test`, `jest`, or any subset of it) on your own initiative — only when the user asks for it directly in that task. Finishing an implementation is not a reason to run tests, and neither is wanting to confirm a change did no harm; `lint` and `typecheck` are the checks that run unprompted.

---

## Post-Implementation — Workflow

After finishing **all** edits in a task:

1. Run `npm run lint` and `npm run typecheck` in the terminal. Fix every reported lint and type error before proceeding. **These two, and only these two** — do not run the tests here.
2. Launch an **independent subagent** with `.claude/commands/review-changes.md` (the `/review-changes` command), passing the list of every file changed and a short description of what was implemented. Wait for the full report.
3. Fix **all Critical and Warning** issues from the report, then re-run `npm run lint` and `npm run typecheck` to confirm no new issues were introduced.
4. Run `.claude/commands/review-agents-docs.md` (the `/review-agents-docs` command) with the same list of changed files to audit the affected documentation.

> **Review severity levels.** **Critical** = broken contract, bug, security risk, or a violation of a structural project convention. **Warning** = style inconsistency, a pattern applied incompletely, or a decision that will accrue debt. **Suggestion** = optional improvement with no immediate impact.
