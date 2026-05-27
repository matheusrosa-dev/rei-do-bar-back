@AGENTS.md

## Rule Zero — Read the AGENTS.md files

Before accessing, creating, or modifying any file inside a directory, you **must** read the `AGENTS.md` file in that directory, if one exists. Also read the root `AGENTS.md` before any task.

The AGENTS.md files are the source of truth for conventions in their respective scopes and take precedence over any inferred pattern. Never assume a convention — always consult the corresponding AGENTS.md first.

---

## Hard Constraints

- **NEVER alter the directory structure or create new scaffolding folders/files without first asking the user and receiving explicit confirmation.**
- **NEVER install, remove, or update dependencies without first asking the user and receiving explicit confirmation.** Present the package and the justification, then wait for approval.
- **NEVER run destructive database commands** (`migrate reset`, `db push`, `db drop`) without explicit user confirmation.
- Do not over-engineer. Only implement what was requested.
- Do not add comments, docstrings, or type annotations to code you did not change.
- Do not add comments unless they are genuinely necessary to explain non-obvious logic.
- Never use `process.env` directly in application code — always access config through `ConfigService.get<IType>("namespace")`.
- Never throw raw `Error` or `HttpException` — always use `AppException` with a registered error code.
- All user-facing strings (error messages, logs) must be in **Portuguese (pt-BR)**.

---

## Post-Implementation — Code Review

After finishing **all** edits in a task:
1. Run `yarn lint` in the terminal. If any errors are reported, fix them before proceeding.
2. Run `/code-review` passing the list of every file changed and a short description of what was implemented.
3. Fix **all Critical and Warning issues** reported by the code review. Then re-run `yarn lint` to confirm no new issues were introduced.
4. After all issues are resolved, run `/review-agents-docs` passing the same list of files changed.
