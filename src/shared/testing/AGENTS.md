# AGENTS.md — src/shared/testing/

## What belongs here

Test infrastructure exclusively — manual mocks and data factories. **Nothing in this directory is imported by production code.**

---

## Prisma Mock

A manually maintained mock object mirrors the Prisma client's shape and is injected in place of the Prisma service when building the testing module. The transaction method is mocked to invoke its callback immediately with the mock itself, so transactional code runs inline in tests. When a service starts calling a new Prisma method, add the corresponding mock function here. Recorded calls are cleared between tests by the runner config (`clearMocks`).

A missing entry does not fail cleanly: a service reaching for an unmocked model throws a synchronous `TypeError` mid-statement, which in an array-form transaction leaves the sibling promise rejection unhandled and **kills the Jest worker** — the suite reports "failed to run" rather than pointing at the assertion. Add the model before writing the test.

Partial service mocks are also exported here for controller tests that should not exercise real service logic. A few of them ship a **default return value** declared at definition time (e.g. the welcome-discount calculation resolving to `0`). This relies on the runner using `clearMocks` — which clears recorded calls but keeps implementations. Switching the config to `resetMocks` would silently drop those defaults and break the suites that depend on them.

---

## Factories

Each factory exposes static "create one" and "create many" methods and uses a fake-data library for realistic values. Factories require relational props to be passed explicitly (no implicit nesting), so test data is composed from the bottom up. Composite types extend the Prisma-generated model types with their relations, matching the exact shape that production queries return — keeping factory output correctly typed.

Because the return type is the generated model, a factory goes stale the moment a column is added to its model — the compiler catches it, but only once something imports the factory. Most factories carry their own spec under `factories/__tests__/<name>.factory.spec.ts`, asserting the defaults' shape, that explicit props win, and that `createMany` yields independent instances; add one alongside a new factory.

---

## Conventions

| Rule | Detail |
|---|---|
| Test-only | Never import anything from this directory in non-test code |
| Keep the mock in sync | Add a mock function whenever a service calls a new Prisma method |
| Explicit composition | Provide relational props explicitly and compose factories bottom-up |
| Spying on privates | Access private methods via an `as any` cast — `jest.spyOn(service as any, "method")` to assert calls, or direct bracket-access invocation — with the matching Biome suppression comments |
| Stub a shared helper with `jest.mock`, not `jest.spyOn` | `@swc/jest` emits module exports as non-configurable getters, so `jest.spyOn(helperModule, "fn")` throws `Cannot redefine property`. Replace the module instead: `jest.mock("@shared/helpers/<name>", () => ({ … }))`, which resolves through the `moduleNameMapper` in `jest.config.ts` |
