---
title: Combine routers safely
description: Compose tracked HTTP routers, diagnose canonical route conflicts, and mount one conflict-checked router.
---

# Combine routers with `combineRouters`

Use `combineRouters(...routers)` when independently defined HTTP routers should share one mount point. It requires at least one router, returns a new router without mutating its inputs, and prevents two inputs from claiming the same HTTP method and canonical path.

The safest pattern is to create every input from one context-bound factory:

```typescript
import {
  combineRouters,
  createServer,
  init,
  ok,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext extends HonoBaseContext {
  requestId: string;
}

const t = init<AppContext>();

const usersRouter = t.router({
  "/users": t.procedure.get(() => ok([])),
});

const postsRouter = t.router({
  "/posts": t.procedure.get(() => ok([])),
});

const apiRouter = t.combineRouters(usersRouter, postsRouter);

const app = createServer<AppContext>(
  { "/api": apiRouter },
  {
    createContext: () => ({ requestId: crypto.randomUUID() }),
  },
);
```

`apiRouter` contains both procedures and carries the type-only route metadata `"GET /users" | "GET /posts"`. That metadata remains available if you combine `apiRouter` again later.

## What counts as a conflict

A route identity is its uppercase HTTP method plus its canonical path. Canonicalization applies the same rules in TypeScript and at runtime:

- add a leading slash;
- remove trailing slashes except for the root path;
- normalize every OpenAPI path-parameter name to `{param}`.

| First route | Second route | Result |
| --- | --- | --- |
| `GET users/{id}/` | `GET /users/{userId}` | Conflict: both become `GET /users/{param}`. |
| `GET /items` | `POST /items` | Valid: the methods differ. |
| `GET /users/me` | `GET /users/{id}` | Valid exact signatures; see the static/dynamic caveat below. |
| `GET /health` | `GET /metrics` | Valid: the paths differ. |

For example, these routers cannot be combined:

```typescript
const byId = t.router({
  "users/{id}/": t.procedure
    .input({ params: z.object({ id: z.string() }) })
    .get(() => ok({ source: "id" })),
});

const byUserId = t.router({
  "/users/{userId}": t.procedure
    .input({ params: z.object({ userId: z.string() }) })
    .get(() => ok({ source: "userId" })),
});

const api = t.combineRouters(byId, byUserId);
// Type error includes:
// "Conflicting route signatures": "GET /users/{param}"
```

## The same path can support multiple methods

Method identity is part of the signature, so separate routers can own different methods at one path:

```typescript
const readItems = t.router({
  "/items": t.procedure.get(() => ok([])),
});

const createItem = t.router({
  "/items": t.procedure.post(() => ok({ id: "item_1" })),
});

const itemsRouter = t.combineRouters(readItems, createItem);
// Carries "GET /items" | "POST /items".
```

You can also put both methods in one methods object when they belong to the same module. Use `combineRouters()` when separate modules need to remain independently owned.

## Add prefixes before combining

`combineRouters()` does not add a prefix. When two routers intentionally use the same method and path, wrap them in declarative routers with distinct prefixes first:

```typescript
const v1Router = t.router({
  "/users": t.procedure.get(() => ok({ version: 1 })),
});

const v2Router = t.router({
  "/users": t.procedure.get(() => ok({ version: 2 })),
});

const prefixedV1 = t.router({ "/v1": v1Router });
const prefixedV2 = t.router({ "/v2": v2Router });

const versionedApi = t.combineRouters(prefixedV1, prefixedV2);
```

The resulting signatures are `GET /v1/users` and `GET /v2/users`, so they do not conflict.

## Use tracked declarative routers

Compile-time conflict detection depends on exact route metadata. Preserve it by using the factory returned by `init<TContext>()`.

| Router source | Accepted by `combineRouters()`? | Why |
| --- | --- | --- |
| `t.router({...})` | Yes | Carries exact declarative route signatures. |
| A router nested inside `t.router({...})` | Yes | The prefix is included in its signatures. |
| A previous `t.combineRouters(...)` result | Yes | Combined metadata is preserved. |
| `new Router()` plus `register*()` | No | Imperative mutation cannot be represented reliably in its static type. |
| `createRouter()` | No | Constructor-style routers use broad, untracked metadata. |
| A value widened to `Router<AppContext>` | No | The annotation erases its exact signature union. |

For a custom context, prefer this:

```typescript
const t = init<AppContext>();
const users = t.router({
  "/users": t.procedure.get(() => ok([])),
});
```

Avoid explicitly calling the standalone helper as `router<AppContext>({...})` for routers you plan to combine. TypeScript fills the later config generic with its broad default when only the context generic is supplied, so the exact route metadata is not retained.

An untracked input produces a diagnostic containing:

```text
combineRouters requires routers created by router()
```

## Keep router contexts compatible

Create inputs from the same `init<AppContext>()` factory whenever possible. This gives every procedure the same request-context contract and avoids a `Router context mismatch` diagnostic.

The output uses the first router's context. That context must satisfy the context required by every later router. A more specific first context can therefore combine with a router that only requires a subset of its fields, but reversing that order is rejected.

```typescript
interface RequestContext extends HonoBaseContext {
  requestId: string;
}

interface UserContext extends RequestContext {
  userId: string;
}

const requestApi = init<RequestContext>();
const userApi = init<UserContext>();

const requestContextRouter = requestApi.router({
  "/request": requestApi.procedure.get(({ ctx }) => ok(ctx.requestId)),
});

const userContextRouter = userApi.router({
  "/user": userApi.procedure.get(({ ctx }) => ok(ctx.userId)),
});

// Allowed: UserContext contains every RequestContext field.
const app = combineRouters(userContextRouter, requestContextRouter);

// Rejected: RequestContext cannot satisfy procedures requiring userId.
const invalid = combineRouters(requestContextRouter, userContextRouter);
```

Most applications should use one shared context rather than rely on ordering.

## Runtime checks remain active

TypeScript cannot protect plain JavaScript, unsafe casts, dynamically widened values, or routers mutated after construction. `combineRouters()` scans the procedures again at runtime and throws before returning an ambiguous router.

```text
Route conflict: GET /users/{param}
```

Calling it without an input also throws at runtime:

```text
combineRouters requires at least one router
```

If a conditional composition can be empty, handle that branch explicitly or use `t.router({})` as a tracked empty router. Do not call `combineRouters()` with zero arguments.

## Migrate from the removed HTTP composition API

The old HTTP `mergeRouters` export has been removed. Replace flat composition with the factory method:

```typescript
// Before
const apiRouter = mergeRouters(usersRouter, postsRouter);

// After
const apiRouter = t.combineRouters(usersRouter, postsRouter);
```

Router arrays are also no longer accepted by server mounting or OpenAPI inputs. Combine first, then mount or generate the spec from one router:

```typescript
// Before
createServer({ "/api": [usersRouter, postsRouter] });
generateOpenAPISpec({ "/api": [usersRouter, postsRouter] });

// After
const apiRouter = t.combineRouters(usersRouter, postsRouter);
createServer({ "/api": apiRouter });
generateOpenAPISpec({ "/api": apiRouter });
```

The Kafka and workers packages still expose their own `mergeRouters` functions. Those APIs compose topics and jobs rather than HTTP method/path signatures and are not affected by this migration.

## Troubleshooting

### `Conflicting route signatures`

Two inputs claim the same canonical method/path pair. Change a method, add a declarative prefix before combining, or remove the duplicate route.

### `combineRouters requires routers created by router()`

At least one input has broad or erased route metadata. Rebuild it with the same context-bound `t.router()` factory as the other inputs and avoid widening the variable to `Router<Context>`.

### `Router context mismatch`

The first router's context cannot satisfy a later router's procedures. Prefer one shared `init<AppContext>()` factory, or put the router with the most specific compatible context first.

### Static and dynamic routes still overlap at runtime

`GET /users/me` and `GET /users/{id}` are not exact canonical duplicates, so `combineRouters()` permits them. Framework matching and registration order can still make that pair ambiguous. Avoid the overlap or confirm the selected adapter's ordering behavior with an integration test.

## Related documentation

- [Server quickstart](./quickstart.md)
- [Server common patterns](./common-patterns.md#compose-routers-by-path)
- [Core `combineRouters()` API](./api/core.md#combineroutersrouters)
