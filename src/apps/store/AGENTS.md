# AGENTS.md — src/apps/store/

## What belongs here

The customer-facing surface of the API — everything the store app consumes, from an anonymous first visit through an authenticated order. It is a **container module only**: `StoreModule` owns no controller or service of its own, just the sub-modules it registers (`auth/`, `cart/`, `categories/`, `coupons/`, `customers/`, `me/`, `notifications/`, `orders/`, `products/`, `settings/`), mirroring how `src/apps/admin/` and `src/apps/delivery-persons/` are organized.

Every sub-module but `notifications/` has its own `AGENTS.md`; this file covers only what is shared across the app.

## What does NOT belong here

- Catalog, coupon, customer, order, and settings **management** → `src/apps/admin/`. This app reads and places orders; it never administers.
- Anything the delivery app consumes → `src/apps/delivery-persons/`.
- Guard, decorator, and interceptor implementations → `src/shared/`.

---

## Authentication

Two things authenticate a store request, and they answer different questions. The **app credential** — a fixed Basic pair in the `x-store-authorization` header — answers *did this come from the store app*, and is required on **every route without exception**. The **session** answers *who is calling*, and is layered on top: a device id identifies the anonymous session, and a customer id is *added* to it once the person logs in, so an authenticated request carries both.

That gives the store **four credential levels**, and each route declares its own with `StoreAuth` (see `src/shared/guards/AGENTS.md`):

| Level | Guards | Where it is used |
|---|---|---|
| `@StoreAuth("basic")` | store basic-auth | `categories/`, `settings/`, and the `sync-device-id` route in `auth/` |
| `@StoreAuth("deviceId")` | store basic-auth → device-id | `cart/` (except its reorder route), `products/`, and the OTP send/login routes in `auth/` |
| `@StoreAuth("accessToken")` | store basic-auth → device-id → access-token | `me/` (both controllers), `orders/`, `coupons/`, `notifications/`, and the reorder route in `cart/` |
| `@StoreAuth("refreshToken")` | store basic-auth → device-id → refresh-token | the `refresh` and `logout` routes in `auth/` |

The app credential sits inside all four levels because it is unconditional. The device-id guard sits inside the other three because an authenticated request still resolves its cart and catalog by device id. The access and refresh levels are **siblings**, not rungs on a ladder — a refresh token is a different credential from an access token, not a stronger one. Picking a level is a choice of **which session credential the route consumes on top of the app credential**, never a choice between them.

**Three routes sit at `basic`** — session-less, but not credential-less:

| Route | Why it needs no session |
|---|---|
| `POST auth/sync-device-id` | It *mints* the device id, so it cannot require one. Rate-limited per IP on top |
| `GET categories` | The same list for every visitor; nothing session-specific |
| `GET settings` | The client needs the delivery fee, alerts, and business hours before it has a session |

Where the level is declared varies: most controllers state it once on the class, while `auth/` and `cart/` state it per handler — `auth/` because its routes sit at four different levels, `cart/` because its reorder route needs a customer while the rest of the module also serves anonymous sessions. Class- and handler-level guards are **additive** when both are present, so stacking a class-level decorator with a stronger handler-level one re-runs the lower level's guards rather than replacing them; reach for that combination only when a single route genuinely needs a stronger session credential than the rest of its module.

Since no guard is registered globally, a controller without `StoreAuth` reaches its handler with no credential at all — there is nothing left to catch an omission. **A new store controller must state its level explicitly**, and `basic` is the floor: a session-less route says so in its own `AGENTS.md`, but no store route is ever left undecorated.

---

## Core Patterns

- **One sub-module per domain**, each with the standard module/controller/service/`dtos` layout, registered in `store.module.ts`. The container module declares no providers. Two deviations are expected and documented in the root `AGENTS.md`: `customers/` is internal (no controller, no `dtos/`), and `me/` carries a second controller for addresses.
- **Class names carry no prefix** — unlike the `Admin` and `DeliveryPersons` sub-modules, the store classes are the unprefixed ones (`OrdersService`, `ProductsController`). A new admin or delivery counterpart takes the prefix; this app keeps the bare name.
- **Cross-module reuse goes through the owning module's exported service.** `coupons/` is the hybrid case: it exports `CouponsService` to `cart/` and `orders/` **and** owns a client-facing controller, so it is imported both by `StoreModule` (for the route) and by its consumers (for the service). Never duplicate a rule into a second module or hoist it out of `apps/`.
- **Serialization is the client-visibility allowlist.** Every controller applies `@Serialize(Dto)` at class level, and the DTO exposes only what clients may see — unlike admin routes, which return full rows. Adding a column to Prisma never exposes it here; adding it to the DTO does.
- **The session resolver branches on `customerId` presence**, not on an either/or with the device id. `cart/` throws when the owner or cart is missing; `products/` deliberately falls back to an empty cart instead. See each module's `AGENTS.md` — that difference is intentional.
