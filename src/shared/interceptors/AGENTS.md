# AGENTS.md — src/shared/interceptors/

## Interceptors in This Project

Three interceptors are defined here. Two are registered globally (in `applyGlobalConfig` or `AppModule`); one is applied per-controller.

| Interceptor | Registration | Effect |
|---|---|---|
| `WrapperDataInterceptor` | Global (`applyGlobalConfig`) | Wraps every response in `{ data: ... }` |
| `DelayInterceptor` | Global (`APP_INTERCEPTOR` in `AppModule`) | Adds artificial delay from `API_DELAY` env var |
| `SerializeInterceptor` | Per-controller via `@Serialize(Dto)` | Strips response to only `@Expose()`-decorated fields |

---

## `WrapperDataInterceptor`

Wraps response in `{ data: body }`. **Passthrough condition**: if `body` is falsy or already has a `data` key, it is returned unchanged. This allows endpoints that return `{ data: ... }` explicitly (or return nothing) to avoid double-wrapping.

```typescript
map((body) => {
  if (!body || "data" in body) return body;
  return { data: body };
})
```

---

## `SerializeInterceptor` + `@Serialize(Dto)` decorator

The canonical way to control response shape in this project. Applied at controller class level:

```typescript
@Controller("cart")
@Serialize(CartDto)
export class CartController { ... }
```

Internally uses `plainToInstance(dto, data, { excludeExtraneousValues: true })`. Only fields decorated with `@Expose()` in the DTO class are included. Nested objects require `@Type(() => NestedDto)` + `@Expose()` on the parent field.

**Important interaction with `WrapperDataInterceptor`**: `SerializeInterceptor` runs first (applied closer to the handler), then `WrapperDataInterceptor` wraps the serialized output. The final response shape is `{ "data": <serialized DTO> }`.

### Writing a response DTO

```typescript
import { Expose, Type } from "class-transformer";

export class ExampleDto {
  @Expose()
  id!: string;

  @Expose()
  @Type(() => NestedDto)
  items!: NestedDto[];
}

class NestedDto {
  @Expose()
  name!: string;
}
```

---

## `DelayInterceptor`

Configured at module level by `AppModule` using `ConfigService` to read `API_DELAY`. When `ms <= 0`, returns the handler observable untouched (no RxJS operator overhead). Used exclusively for development/testing to simulate network latency.
