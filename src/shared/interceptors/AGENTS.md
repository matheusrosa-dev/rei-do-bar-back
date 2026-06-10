# AGENTS.md — src/shared/interceptors/

## Interceptors

Three interceptors live here — two global, one per-controller.

| Interceptor | Registration | Effect |
|---|---|---|
| Response wrapper | Global | Wraps every response in a `data` envelope |
| Artificial delay | Global | Adds a configurable response delay for frontend development |
| Serializer | Per-controller, via the serialize decorator | Reduces the response to only the DTO's exposed fields |

---

## Response Wrapper

Wraps the response body in a `data` envelope. **Passthrough**: a falsy body, or one that already has a `data` key, is returned unchanged — this prevents double-wrapping for handlers that return the envelope themselves or return nothing.

## Serializer + Serialize Decorator

The canonical way to control response shape. The decorator is applied at controller **class level** and runs the body through class-transformer with extraneous values excluded, so only fields explicitly marked as exposed are returned; nested objects require an explicit nested-type declaration.

**Ordering**: the serializer runs closer to the handler than the response wrapper, so the final shape is the serialized DTO inside the `data` envelope.

## Artificial Delay

Configured from env at module level; when the configured delay is non-positive it returns the stream untouched, adding no operator overhead. It exists only to simulate network latency in development.

---

## Conventions

| Rule | Detail |
|---|---|
| Control response shape via the DTO | Use the serialize decorator at class level; do not hand-build response objects |
| Expose intentionally | Only fields explicitly marked as exposed are returned; declare nested types explicitly |
| Don't double-wrap | Rely on the wrapper's passthrough rather than returning a `data` envelope manually |
