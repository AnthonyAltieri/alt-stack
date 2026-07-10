---
title: Server common patterns
description: Compose routers, context, middleware, errors, OpenAPI, and telemetry across Altstack adapters.
---

# Server common patterns

The server packages share one contract model, but they do not erase the differences between Hono, Express, Bun, NestJS, and TanStack Start. This page starts with portable patterns and calls out where the adapters diverge.

## Reuse a procedure policy

A `BaseProcedureBuilder` is immutable: each `.input()`, `.output()`, `.errors()`, and `.use()` call returns a new builder. Keep a public base and derive policy-specific builders from it.

```typescript
import {
  TaggedError,
  err,
  init,
  ok,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { z } from "zod";

interface User {
  id: string;
}

declare function userFromAuthorizationHeader(
  authorization: string | undefined,
): Promise<User | null>;

class UnauthorizedError extends TaggedError<"UnauthorizedError"> {
  readonly _tag = "UnauthorizedError" as const;
}

const t = init<HonoBaseContext>();

const protectedProcedure = t.procedure
  .errors({
    401: z.object({
      _tag: z.literal("UnauthorizedError"),
    }),
  })
  .use(async ({ ctx, next }) => {
    const authorization = ctx.hono.req.header("Authorization");
    const user = await userFromAuthorizationHeader(authorization);

    if (!user) return err(new UnauthorizedError("Sign in required"));
    return next({ ctx: { user } });
  });

const users = t.router({
  "/me": protectedProcedure
    .output(z.object({ id: z.string() }))
    .get(({ ctx }) => ok({ id: ctx.user.id })),
});
```

This is the usual protected-route shape: read credentials from the adapter request, resolve the application user, return a declared tagged error when authentication fails, and add the authenticated user to downstream context. `userFromAuthorizationHeader` represents application-owned token/session verification; keep that logic outside the procedure builder.

Calling `next({ ctx: patch })` shallow-merges the patch and narrows the context seen by later middleware and the handler. Call and return `next()` so downstream middleware actually runs. Here, the `/me` handler sees `ctx.user` as `User`, not `User | null`.

### Reusable middleware builders

`createMiddleware<TContext>()` builds a reusable throwing/inline-`Result` chain with `.pipe()`. `createMiddlewareWithErrors<TContext>()` additionally carries error schemas into procedures that call `.use(builder)`.

There is a current runtime limitation: when a core `Router` materializes a procedure, it does not preserve the flag that distinguishes Result-specific middleware. Adapters still recognize a top-level `err(...)` result, but the Result-shaped downstream `next()` contract of `createMiddlewareWithErrors()` is not reliable after router registration. Prefer the inline pattern above for server procedures. The standalone Nest `createNestMiddleware()` bridge does preserve the Result-specific flag.

## Compose routers by path

The key in a router config is a path or prefix. Leading slashes are optional; stored procedure paths are normalized with a leading slash. Use OpenAPI braces for parameters.

```typescript
const healthRouter = t.router({
  "/health": t.procedure.get(() => ok({ ready: true })),
});

const userRouter = t.router({
  "/{id}": t.procedure
    .input({ params: z.object({ id: z.string() }) })
    .get(({ input }) => ok({ id: input.params.id })),
});

const appRouter = t.router({
  "/": healthRouter,
  "/users": userRouter,
});
```

Use `combineRouters()` when independent routers should share the same mount prefix:

```typescript
const metricsRouter = t.router({
  "/metrics": t.procedure.get(() => ok({ healthy: true })),
});

const apiRouter = t.combineRouters(appRouter, metricsRouter);

createServer({
  "/api": apiRouter,
});
```

`combineRouters()` requires at least one tracked declarative router. It rejects duplicate canonical method/path signatures at compile time and repeats the check at runtime. The same path with a different method is valid:

```typescript
const readItems = t.router({
  "/items": t.procedure.get(() => ok([])),
});
const createItem = t.router({
  "/items": t.procedure.post(() => ok({ id: "1" })),
});

// Valid: GET /items and POST /items are distinct route signatures.
const items = t.combineRouters(readItems, createItem);
```

See [Combine routers with `combineRouters`](./combine-routers.md) for canonicalization rules, tracked versus untracked routers, context compatibility, runtime errors, migration from the removed HTTP composition API, and troubleshooting.

When two routers intentionally reuse a method and path, give them distinct prefixes before combining:

```typescript
const v1 = t.router({ "/v1": v1Router });
const v2 = t.router({ "/v2": v2Router });
const versionedApi = t.combineRouters(v1, v2);
```

For multiple methods on one path, use a methods object and pending `.handler()` procedures:

```typescript
const items = t.router({
  "/items/{id}": {
    get: t.procedure
      .input({ params: z.object({ id: z.string() }) })
      .handler(({ input }) => ok({ id: input.params.id })),
    delete: t.procedure
      .input({ params: z.object({ id: z.string() }) })
      .handler(({ input }) => ok({ deleted: input.params.id })),
  },
});
```

The path type checks only that every `{param}` has a key in `input.params`; it does not reject extra schema keys.

## Create request context at the adapter edge

Context factories run after input validation and before procedure middleware.

```typescript
interface AppContext extends HonoBaseContext {
  requestId: string;
}

const t = init<AppContext>();

const app = createServer<AppContext>(
  { "/api": api },
  {
    createContext: (hono) => ({
      requestId: hono.req.header("x-request-id") ?? crypto.randomUUID(),
    }),
  },
);
```

Do not return adapter-owned keys from `createContext`: Hono supplies `hono`, Express supplies `express`, Bun supplies `bun`, TanStack supplies `tanstack`, and every telemetry-capable adapter supplies `span`.

NestJS is slightly different:

- `init<TCustomContext>()` automatically intersects `TCustomContext` with `NestBaseContext`; pass only your extra fields.
- `ctx.nest.get(Token)` retrieves a regular provider synchronously.
- `await ctx.nest.resolve(Token)` resolves request-scoped or transient providers with a request context ID that is cached for the request.
- Context written by `createNestMiddleware()` is merged after `registerAltStack().createContext`, so the middleware value wins on duplicate non-reserved keys.

## Validate transport input deliberately

All adapters validate each configured input section with `safeParseAsync` and accumulate Zod failures before the handler runs.

```typescript
t.procedure.input({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1),
    sort: z.enum(["name", "createdAt"]).optional(),
  }),
  body: z.object({ title: z.string().min(1) }),
});
```

Key constraints:

- URL params and query values originate as strings. Their object fields must accept string input at compile time. Coercion and string transforms are supported; a bare `z.number()` is rejected.
- `input.params`, `input.query`, and `input.body` are always separate. Missing schema sections appear as `undefined` in the handler.
- Hono and Bun treat an unreadable JSON body as `{}`. Express's built-in `express.json()` can reject malformed JSON before the Altstack handler. TanStack parses JSON only when the request has a body schema and its content type includes `application/json`; otherwise it supplies text.
- TanStack preserves repeated query keys as arrays. Bun overwrites duplicates with the last value. Hono and Express follow their framework parsers.
- Input transforms may be asynchronous on every adapter. Output validation uses synchronous `.parse()` on Hono, Express, and Bun, but `.parseAsync()` on TanStack Start.

`mergeInputs()` exists for consumers that need a flattened compatibility shape, but server handlers use the structured shape and do not call it.

## Model expected failures with tagged errors

Declare each expected error status on the procedure and return an `Err` containing an actual `Error` instance with the matching literal `_tag`.

```typescript
class ConflictError extends TaggedError {
  readonly _tag = "ConflictError" as const;

  constructor(readonly key: string) {
    super(`Key ${key} already exists`);
  }
}

const createItem = t.procedure
  .errors({
    409: z.object({
      _tag: z.literal("ConflictError"),
      key: z.string(),
    }),
  })
  .post(() => err(new ConflictError("slug")));
```

Status selection inspects only a direct `_tag` literal on each error schema. An undeclared or unextractable tag falls back to status 500.

Current limitations matter when several domain errors share a status:

- JavaScript object keys allow only one schema per numeric status.
- Repeating `.errors()` with the same status overwrites the runtime schema even though the builder's TypeScript type forms a union.
- `extractTagsFromSchema()` does not traverse `z.union()` or `z.discriminatedUnion()`; such schemas do not map their tags at runtime.

Use distinct statuses where the contract permits. If several tags must share a status, confirm the single direct-literal schema form against the current runtime before publishing it; do not assume a Zod union will work.

## Error wire formats and OpenAPI

The runtime currently has three server-error shapes.

### Declared `Err` values

Hono, Express, Bun, NestJS, and TanStack Start serialize a tagged error as:

```json
{
  "error": {
    "code": "ConflictError",
    "message": "Key slug already exists",
    "_tag": "ConflictError",
    "key": "slug"
  }
}
```

The adapter includes every enumerable own error property except `name`, `message`, and `stack`. `_tag` is normally enumerable, so both `code` and `_tag` appear.

### Adapter fallbacks

Without `defaultErrorHandlers`, validation and uncaught failures use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": []
  }
}
```

or the same envelope with `code: "INTERNAL_SERVER_ERROR"`. The current 500 fallback includes the thrown error's stack in `details`; configure a production-safe handler if that disclosure is unacceptable.

### Factory handlers

`init(options)` always returns `defaultErrorHandlers`, but adapters do not receive them automatically. Pass them explicitly:

```typescript
const t = init<AppContext>({
  default500Error: () => [
    z.object({
      _tag: z.literal("InternalServerError"),
      message: z.string(),
      details: z.array(z.string()),
    }),
    {
      _tag: "InternalServerError" as const,
      message: "Internal server error",
      details: [],
    },
  ],
});

const app = createServer(
  { "/api": api },
  { defaultErrorHandlers: t.defaultErrorHandlers },
);
```

This path returns `{ "error": instance }`; it does not add `code`. The callback's schema is used for factory typing, but the adapters ignore the schema value when sending the response.

### OpenAPI mismatch

`generateOpenAPISpec()` currently describes each declared error schema as the entire response body. It does not add the runtime `{ error: ... }` envelope or the `code`/`message` fields synthesized by adapters. It also omits automatic validation and uncaught-error responses, and always documents successful responses as status 200. Raw `Response` statuses are not reflected.

Treat the generated spec as a schema inventory until you account for this mismatch in client generation or add a contract layer outside the current generator. Do not claim that the generated error response schema exactly describes the wire format.

## Serve OpenAPI and Swagger UI

`generateOpenAPISpec()` accepts a prefix-to-router map and `title`, `version`, and `description`. It emits OpenAPI 3.0.0, derives operation IDs from method and path, converts Zod schemas with Zod 4's `toJSONSchema`, and stores body/output/error schemas under `components.schemas`.

Adapter helpers differ:

| Adapter | Helper | How to mount |
| --- | --- | --- |
| Hono | `createDocsRouter()` returns an Altstack router | include it in `createServer({ "/docs": docs })` |
| Express | `createDocsRouter()` returns a native Express router | `app.use("/docs", docs)` |
| Bun | `createDocsRouter()` returns an Altstack router | include it in `createServer({ "/docs": docs })` |
| NestJS | `registerAltStack({ docs: { path: "/docs" } })` | mounted for you beneath the effective base path |
| TanStack Start | `generateOpenAPISpecFromServerRoutes()` | serve the returned object yourself |

`openapiPath` defaults to `openapi.json`; a leading slash is removed. `enableDocs: false` disables only the Swagger UI route, not the JSON route. The provided UI loads Swagger UI 5.10.5 assets from `unpkg.com`, so it requires browser network access and may not fit a strict content-security policy.

The `docs` property accepted by Hono's `createServer()` options is currently unused. Create and mount a docs router explicitly.

## Trace requests with OpenTelemetry

Hono, Express, Bun, and NestJS-through-Express accept `telemetry: true` or a configuration object:

```typescript
import { initTelemetry } from "@alt-stack/server-hono";

await initTelemetry();

const app = createServer(
  { "/api": api },
  {
    telemetry: {
      enabled: true,
      serviceName: "users-api",
      ignoreRoutes: ["/api/health"],
    },
  },
);
```

Install and configure `@opentelemetry/api` plus an SDK/provider in the application. Adapters start a server span named `METHOD route`, set `http.request.method`, `http.route`, and `url.path`, and place the span on `ctx.span`. Exact ignored paths and their subpaths are skipped; a partial string prefix such as `/healthz` does not match `/health`.

Adapters call `initTelemetry()` without awaiting it. Await it at startup, as shown above, when the first request must be traced deterministically. TanStack Start currently exposes core telemetry helpers but does not accept a telemetry option or create request spans itself.

## Return a native `Response` when supported

With no output schema, a handler may return `ok(new Response(...))` on Hono, Bun, and TanStack Start; those adapters pass it through. Express serializes the success value with `res.json()` and does not support handler-level Web `Response` passthrough. Its procedure-middleware Web `Response` branch also does not write the response, so avoid that pattern on Express and NestJS routes registered through Express.

| Capability | Hono | Express | Bun | NestJS registration | TanStack Start |
| --- | --- | --- | --- | --- | --- |
| Native response passthrough | Web `Response` | No | Web `Response` | No | Web `Response` |
| Async output transforms | No | No | No | No | Yes |
| Built-in docs router | Altstack router | Express router | Altstack router | optional Express router | spec only |
| Automatic telemetry option | Yes | Yes | Yes | Yes | No |
| Starts/listens itself | No | No | Yes | No | framework-owned |

## Use Altstack middleware in Nest controllers

`createNestMiddleware()` lets conventional controllers and Altstack routes share one middleware policy. Apply the returned Express-style function through a Nest consumer.

```typescript
const auth = createMiddlewareWithErrors<NestBaseContext>()
  .errors({
    401: z.object({ _tag: z.literal("UnauthorizedError") }),
  })
  .fn(async ({ ctx, next }) => {
    const actor = await authenticate(ctx.express.req);
    return actor
      ? next({ ctx: { actor } })
      : err(new UnauthorizedError("Sign in required"));
  });

consumer
  .apply(createNestMiddleware(app, auth))
  .forRoutes("*");
```

By default raw `params`, `query`, and `body` are exposed on `ctx.input`, tagged errors are sent immediately, and non-reserved context overrides are stored on the request for later Altstack route handlers. Set `includeInput: false` to suppress raw input, `onError: "next"` to delegate errors to Nest/Express, or `errors` to supply a status map when the middleware itself does not carry one.

## Adapter-specific routing notes

- **Hono:** `createServer().middleware` can register native Hono handlers before Altstack routes. The special `"*"` path uses `app.use`; other entries use `app.on(methods, path, handler)`.
- **Express:** mount the returned app on a parent for a real base path. `basePath` only changes telemetry labels.
- **Bun:** `port` defaults to 3000 and `hostname` to `0.0.0.0`; unmatched routes return a JSON 404 envelope.
- **NestJS:** only the Express platform is supported. `respectGlobalPrefix` defaults to true and avoids double-prefixing an already-prefixed `mountPath`.
- **TanStack Start:** file route parameters use `$id` and splats use `$`; Altstack converts them to `{id}` and `{_splat}`. Route and server options other than `handlers`, `createContext`, and `defaultErrorHandlers` are forwarded to `createFileRoute()`.

## Reference

- [Core API Documentation](./api/core.md)
- [Hono API](./api/hono.md)
- [Express API](./api/express.md)
- [Bun API](./api/bun.md)
- [NestJS API](./api/nestjs.md)
- [TanStack Start API](./api/tanstack-start.md)
