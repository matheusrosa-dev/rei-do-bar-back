# AGENTS.md — src/shared/testing/

## What belongs here

Test infrastructure exclusively. **Nothing in this directory is imported in production code.**

```
testing/
├── mocks.ts              # Manual jest mock objects for PrismaService and all services
└── factories/
    ├── index.ts          # Barrel re-export of all factories
    ├── types/
    │   └── index.ts      # Composite types used across factories
    ├── address.factory.ts
    ├── anonymous-customer.factory.ts
    ├── cart.factory.ts
    ├── cart-item.factory.ts
    ├── customer.factory.ts
    └── product.factory.ts
```

---

## `mocks.ts` — `prismaMock`

A manually maintained jest mock object that mirrors the Prisma client's shape. Used by injecting it as the `PrismaService` provider in `Test.createTestingModule`:

```typescript
const module = await Test.createTestingModule({
  providers: [
    CartService,
    { provide: PrismaService, useValue: prismaMock },
  ],
}).compile();
```

`$transaction` is mocked to immediately invoke the callback with `prismaMock` itself:

```typescript
$transaction: jest.fn().mockImplementation((callback) => callback(prismaMock))
```

**When adding a new Prisma method in a service**, add the corresponding `jest.fn()` to `prismaMock` in this file. `clearMocks: true` in `jest.config.ts` resets all mocks between tests.

Also exports: `cartServiceMock`, `authServiceMock`, `categoriesServiceMock`, `productsServiceMock`, `settingsServiceMock` — partial service mocks for controller tests.

---

## Factory Classes

Each factory follows the same pattern: a `make<Model>` function and a class with static `createOne` and `createMany` methods. `chance` provides realistic fake data.

```typescript
export class CustomerFactory {
  static createOne(props: Props): CustomerWithRelations { ... }
  static createMany(count: number, props: Props): CustomerWithRelations[] { ... }
}
```

### Type System

Composite types in `factories/types/index.ts` extend Prisma-generated types with relational fields:

```typescript
type CartItemWithProduct = CartItem & { product: Product };
type CartWithItems = Cart & { items: CartItemWithProduct[] };
type AnonymousCustomerWithRelations = AnonymousCustomer & { cart: CartWithItems };
type CustomerWithRelations = Customer & { cart?: CartWithItems; addresses?: Address[] };
```

`cart` is optional on `CustomerWithRelations` because not all test queries include the cart relation. `addresses` reflects the address management feature in `MeService`. These types reflect the exact shape returned by `findUnique/findMany` with `include` in production code, ensuring factories produce correctly typed test data.

### Creating Test Data

Factories require relational props to be provided explicitly (no default nesting). Compose from bottom up:

```typescript
const product = ProductFactory.createOne();
const cartItem = CartItemFactory.createOne({ product });
const cart = CartFactory.createOne({ items: [cartItem] });
const customer = CustomerFactory.createOne({ cart });
```

---

## Conventions

| Rule | Detail |
|---|---|
| Import path | Always `@shared/testing/mocks` and `@shared/testing/factories` |
| No production imports | Never import from `src/shared/testing/` in non-test code |
| Biome suppression | Files use `/** biome-ignore-all lint/... */` for `any` and bracket access on private methods |
| `jest.spyOn` for private methods | Use `jest.spyOn(service as any, "privateMethod")` to spy without exposing the method |
