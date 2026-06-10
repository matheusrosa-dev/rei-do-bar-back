# AGENTS.md — src/shared/testing/

## What belongs here

Test infrastructure exclusively — manual mocks and data factories. **Nothing in this directory is imported by production code.**

---

## Prisma Mock

A manually maintained mock object mirrors the Prisma client's shape and is injected in place of the Prisma service when building the testing module. The transaction method is mocked to invoke its callback immediately with the mock itself, so transactional code runs inline in tests. When a service starts calling a new Prisma method, add the corresponding mock function here. Mocks are reset between tests by the runner config.

Partial service mocks are also exported here for controller tests that should not exercise real service logic.

---

## Factories

Each factory exposes static "create one" and "create many" methods and uses a fake-data library for realistic values. Factories require relational props to be passed explicitly (no implicit nesting), so test data is composed from the bottom up. Composite types extend the Prisma-generated model types with their relations, matching the exact shape that production queries return — keeping factory output correctly typed.

---

## Conventions

| Rule | Detail |
|---|---|
| Test-only | Never import anything from this directory in non-test code |
| Keep the mock in sync | Add a mock function whenever a service calls a new Prisma method |
| Explicit composition | Provide relational props explicitly and compose factories bottom-up |
| Spying on privates | Spy on private methods through the documented bracket-access pattern, with the matching Biome suppression |
