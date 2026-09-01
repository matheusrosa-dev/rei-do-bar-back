@AGENTS.md

## Delta over AGENTS.md

- **NEVER run the test suite** (`npm test`, `jest`, or any subset of it) on your own initiative — only when the user asks for it directly in that task. Finishing an implementation is not a reason to run tests, and neither is wanting to confirm a change did no harm; `lint` and `typecheck` are the checks that run unprompted.
- Post-Implementation step 1 (`lint` + `typecheck`) is **these two, and only these two** — do not run the tests there.
