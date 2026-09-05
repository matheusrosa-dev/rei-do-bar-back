# AGENTS.md — src/shared/interceptors/

## Interceptors

Four interceptors live here — three global, one per-controller.

| Interceptor | Registration | Effect |
|---|---|---|
| Response wrapper | Global (`applyGlobalConfig`) | Wraps every response in a `data` envelope |
| Logging | Global (`applyGlobalConfig`) | Logs `METHOD path status ms` for requests that fail |
| Artificial delay | Global (`APP_INTERCEPTOR` factory in `AppModule`) | Adds a configurable response delay for frontend development |
| Serializer | Per-controller, via the serialize decorator | Reduces the response to only the DTO's exposed fields |

---

## Response Wrapper

Wraps the response body in a `data` envelope. **Passthrough**: a falsy body, or one that already has a `data` key, is returned unchanged — this prevents double-wrapping for handlers that return the envelope themselves or return nothing.

## Serializer + Serialize Decorator

The canonical way to control response shape. The decorator is applied at controller **class level** and runs the body through class-transformer with extraneous values excluded, so only fields explicitly marked as exposed are returned; nested objects require an explicit nested-type declaration.

**Ordering**: the serializer runs closer to the handler than the response wrapper, so the final shape is the serialized DTO inside the `data` envelope.

**A controller whose handlers answer different shapes uses one union DTO** — a single class with every field optional, covering all of them. Absent fields serialize to `undefined` and vanish from the JSON, so each response still carries only its own keys. Do **not** try to override the class decorator with a handler-level one: on the response path a class interceptor runs *after* a handler interceptor, so the class DTO strips whatever the handler DTO produced and the response silently becomes `{}` — a data-loss bug with no error to notice it by. A handler that returns nothing (a 204) needs no accommodation: `undefined` passes through both the serializer and the wrapper untouched.

**Never return a bare primitive from a handler.** The wrapper's passthrough test uses the `in` operator, which throws a `TypeError` on a number, string, or boolean — so a handler returning `5` produces a 500, while `0` slips out unwrapped. Anything scalar goes back as a named field on an object.

## Logging

Logs one line (`METHOD path status ms`) through a dedicated `HTTP` logger context **only when the handler pipeline fails** — successful requests produce no log line, keeping the output to what needs attention. Guards run before interceptors, so a request rejected by an auth or throttler guard never reaches the handler and is **not** logged here either. The error's stack accompanies the line, since the exception filter hides internal-error details from the response and leaves the log as the only diagnostic trace. The error is **rethrown untouched** — the interceptor observes, it never swallows or reshapes; turning an error into a response body is the exception filter's job.

## Artificial Delay

Configured from env at module level; when the configured delay is non-positive it returns the stream untouched, adding no operator overhead. It exists only to simulate network latency in development.

---

## Conventions

| Rule | Detail |
|---|---|
| Control response shape via the DTO | Use the serialize decorator at class level; do not hand-build response objects |
| One DTO per controller, union it if needed | Multiple response shapes share one DTO with optional fields; a handler-level serializer is stripped by the class one, never an override |
| Handlers return objects, never primitives | The wrapper's `in` test throws on a scalar body; wrap scalars in a named field |
| Expose intentionally | Only fields explicitly marked as exposed are returned; declare nested types explicitly |
| Don't double-wrap | Rely on the wrapper's passthrough rather than returning a `data` envelope manually |
