---
title: Server quickstart
description: Define one validated HTTP contract and run it with an Altstack server adapter.
---

# Server quickstart

Altstack server packages turn Zod schemas into validated HTTP procedures. A handler receives parsed `params`, `query`, and `body` values and must return an Altstack `Result`. Pick the adapter that owns your HTTP runtime; all adapters share the procedure and router API from `@alt-stack/server-core`.

## 1. Choose an adapter

| Runtime | Install | Server entry point |
| --- | --- | --- |
| Hono 4 | `pnpm add @alt-stack/server-hono hono zod` | `createServer()` returns a Hono app |
| Express 4 or 5 | `pnpm add @alt-stack/server-express express zod` | `createServer()` returns a new Express app |
| Bun | `bun add @alt-stack/server-bun zod` | `createServer()` calls `Bun.serve()` |
| NestJS 9–11 on Express | `pnpm add @alt-stack/server-nestjs @nestjs/common @nestjs/core @nestjs/platform-express express zod` | `registerAltStack()` mounts onto a Nest app |
| TanStack Start | `pnpm add @alt-stack/server-tanstack-start @tanstack/react-router zod` | `createAltStackFileRoute()` creates a file route |
| Custom adapter | `pnpm add @alt-stack/server-core zod` | consume `Router.getProcedures()` yourself |

`@alt-stack/server-core` declares `@opentelemetry/api` 1.x as an optional peer. Install it when you enable telemetry. Exact peer ranges live in each package manifest.

## 2. Build a working Hono service

For a Node-hosted Hono service, install the Node listener and a TypeScript runner too:

```bash
pnpm add @alt-stack/server-hono hono zod @hono/node-server
pnpm add -D tsx typescript
```

Create `src/server.ts`:

```typescript
import { serve } from "@hono/node-server";
import {
  createServer,
  init,
  ok,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { z } from "zod";

const t = init<HonoBaseContext>();

const api = t.router({
  "/hello/{name}": t.procedure
    .input({
      params: z.object({ name: z.string().min(1) }),
      query: z.object({ excited: z.enum(["true", "false"]).optional() }),
    })
    .output(z.object({ message: z.string() }))
    .get(({ input }) =>
      ok({
        message: `Hello, ${input.params.name}${
          input.query.excited === "true" ? "!" : "."
        }`,
      }),
    ),
});

const app = createServer({ "/api": api });

serve({ fetch: app.fetch, port: 3000 });
```

Run it and call the route:

```bash
pnpm exec tsx src/server.ts
curl 'http://localhost:3000/api/hello/Ada?excited=true'
```

The response is:

```json
{"message":"Hello, Ada!"}
```

The current Hono fallback for an uncaught 500 response includes the thrown message and stack. Before deploying this minimal example, configure a redacting `default500Error` and pass `t.defaultErrorHandlers` into `createServer`; see [Error wire formats and OpenAPI](./common-patterns.md#error-wire-formats-and-openapi) for the source-backed pattern. Express, Bun, and TanStack Start have the same disclosure risk in their default fallback.

The important contract is the procedure chain:

- `.input()` validates request boundaries asynchronously. Path and query schemas must accept string input; use `z.coerce.number()` rather than `z.number()` for numeric URL values.
- `.output()` validates the `Ok` value before it is serialized.
- `.get()`, `.post()`, `.put()`, `.patch()`, and `.delete()` fix the HTTP method. Inside a methods object, use `.handler()` and let the object key select the method.
- Handlers return `ok(value)` or `err(taggedError)`, not a raw value.
- Route parameters use OpenAPI braces (`{name}`) in core, Hono, Express, Bun, and NestJS routers.

## 3. Add a typed error

Every declared error schema needs a direct `_tag: z.literal("...")` field. At runtime the adapter matches the error instance's `_tag` to that schema to select the status code.

```typescript
import { TaggedError, err, ok } from "@alt-stack/server-hono";

class UserNotFoundError extends TaggedError {
  readonly _tag = "UserNotFoundError" as const;

  constructor(readonly userId: string) {
    super(`User ${userId} was not found`);
  }
}

const getUser = t.procedure
  .input({ params: z.object({ id: z.string() }) })
  .output(z.object({ id: z.string(), name: z.string() }))
  .errors({
    404: z.object({
      _tag: z.literal("UserNotFoundError"),
      userId: z.string(),
    }),
  })
  .get(({ input }) =>
    input.params.id === "u_123"
      ? ok({ id: "u_123", name: "Ada" })
      : err(new UserNotFoundError(input.params.id)),
  );
```

The current JSON wire shape for the error is an envelope, not the flat declared schema:

```json
{
  "error": {
    "code": "UserNotFoundError",
    "message": "User missing was not found",
    "_tag": "UserNotFoundError",
    "userId": "missing"
  }
}
```

See [Error wire formats and OpenAPI](./common-patterns.md#error-wire-formats-and-openapi) before publishing this contract to clients.

## 4. Bootstrap another adapter

The router definition is shared. Only the host integration changes.

### Express

```typescript
import {
  createServer,
  init,
  ok,
  type ExpressBaseContext,
} from "@alt-stack/server-express";

const t = init<ExpressBaseContext>();
const api = t.router({
  "/health": t.procedure.get(() => ok({ ready: true })),
});

const app = createServer({ "/api": api });
app.listen(3000);
```

`createServer()` creates an Express app and installs `express.json()`. To put it beneath an existing app, mount the returned app yourself: `parent.use("/v1", app)`. The `basePath` option does not mount routes; it only adjusts telemetry route labels.

### Bun

```typescript
import {
  createServer,
  init,
  ok,
  type BunBaseContext,
} from "@alt-stack/server-bun";

const t = init<BunBaseContext>();
const api = t.router({
  "/health": t.procedure.get(() => ok({ ready: true })),
});

const server = createServer({ "/api": api }, { port: 3000 });
console.log(server.url.href);
```

This starts the listener immediately. Call `server.stop()` during shutdown or tests.

### NestJS on Express

```typescript
import { NestFactory } from "@nestjs/core";
import {
  init,
  ok,
  registerAltStack,
  type NestAppLike,
} from "@alt-stack/server-nestjs";

const t = init();
const api = t.router({
  "/health": t.procedure.get(() => ok({ ready: true })),
});

const app = await NestFactory.create(AppModule);
registerAltStack(app as unknown as NestAppLike, { "/": api }, {
  mountPath: "/api",
});
await app.listen(3000);
```

`registerAltStack()` supports only `@nestjs/platform-express`. By default it prepends Nest's global prefix to `mountPath`.

### TanStack Start

In a file route such as `routes/api/users/$id.ts`, use uppercase handler keys and pending `.handler()` procedures:

```typescript
import {
  createAltStackFileRoute,
  init,
  ok,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";
import { z } from "zod";

const t = init<TanStackBaseContext>();

export const Route = createAltStackFileRoute("/api/users/$id")({
  server: {
    handlers: {
      GET: t.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .handler(({ input }) => ok({ id: input.params.id })),
    },
  },
});
```

TanStack file paths use `$id`; the adapter records `/api/users/{id}` for validation and OpenAPI. Dynamic segments require matching `input.params` keys.

## 5. Add OpenAPI routes

Hono and Bun return an Altstack docs router that you mount in the same config:

```typescript
import { createDocsRouter } from "@alt-stack/server-hono";

const docs = createDocsRouter(
  { "/api": api },
  { title: "Hello API", version: "1.0.0" },
);

const app = createServer({ "/api": api, "/docs": docs });
```

This serves `/docs/openapi.json` and, by default, Swagger UI at `/docs`. Express returns a native Express router instead. Nest can mount the Express docs router through `registerAltStack({ docs: ... })`. TanStack exposes `generateOpenAPISpecFromServerRoutes()` but no docs UI helper.

## Next steps

- [Server common patterns](./common-patterns.md) covers context, middleware, router composition, telemetry, errors, and adapter differences.
- [Core API Documentation](./api/core.md) describes the shared public surface.
- Adapter APIs: [Hono](./api/hono.md), [Express](./api/express.md), [Bun](./api/bun.md), [NestJS](./api/nestjs.md), and [TanStack Start](./api/tanstack-start.md).
