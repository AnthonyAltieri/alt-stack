---
title: Express server API
description: Complete public API and runtime behavior for @alt-stack/server-express.
---

# `@alt-stack/server-express` API Documentation

```bash
pnpm add @alt-stack/server-express express zod
```

The adapter supports Express 4 or 5 and Zod 4.

## `createServer(config, options?)`

```typescript
function createServer<TContext extends ExpressBaseContext = ExpressBaseContext>(
  config: Record<string, Router<TContext>>,
  options?: ExpressServerOptions<TContext>,
): Express;
```

The function creates a new Express application, installs `express.json()`, registers Altstack routes, and returns the app. It does not listen on a port. Each prefix accepts one router; call `combineRouters()` before mounting multiple independent routers at the same prefix.

`ExpressServerOptions` is an anonymous public parameter shape:

| Property | Type / default | Runtime behavior |
| --- | --- | --- |
| `basePath` | `string`; no routing default | Used only as a fallback prefix in telemetry's `http.route` when `req.baseUrl` is empty. It does **not** mount or prefix routes. |
| `createContext` | `(req, res) => Omit<TContext, "express" \| "span"> \| Promise<...>` | Runs after input validation for each matched procedure. |
| `defaultErrorHandlers` | resolved handlers from `init()` or the same shape | Customizes 400/500 payloads. Both callbacks are required when supplied; optional schema properties are ignored by the adapter. |
| `telemetry` | `boolean \| TelemetryConfig`; default disabled | Creates OpenTelemetry server spans except ignored routes. |

To mount under a real base path, use a parent Express application:

```typescript
import express from "express";
import { createServer } from "@alt-stack/server-express";

const parent = express();
parent.use("/v1", createServer({ "/api": api }));
parent.listen(3000);
```

The adapter converts `{param}` to Express `:param`, reads `req.params`, `req.query`, and `req.body`, validates input asynchronously, and supplies:

```typescript
ctx.express.req;
ctx.express.res;
ctx.input;
ctx.span;
```

Only GET, POST, PUT, PATCH, and DELETE procedures are registered. The internal JSON parser runs before route handlers; parser errors that occur before the Altstack handler follow Express's error flow rather than Altstack's default-error callbacks.

### Success and error behavior

- A handler must return an Altstack `Result`.
- A declared `Err` is mapped by `_tag` and sent as `{ error: { code, message, ...enumerableProperties } }`.
- An unknown tag becomes status 500.
- Input validation failures become status 400; thrown handler/output errors become 500.
- Output validation uses synchronous `schema.parse()`.
- Every non-error success is sent with `res.json()` at Express's default status 200.

Express does not pass a Web `Response` through from a handler. An `Ok<Response>` is treated like an ordinary value and JSON-serialized. A procedure middleware branch recognizes Web `Response` but currently returns without writing it to `res`; avoid Web `Response` from procedure middleware as well. Use `ctx.express.res` deliberately only when you also ensure the Altstack handler path does not send a second response.

Without a custom 500 handler, the response includes the thrown stack in `error.details`. See [Error wire formats and OpenAPI](../common-patterns.md#error-wire-formats-and-openapi).

## `createDocsRouter(config, options?)`

```typescript
function createDocsRouter<TCustomContext extends object = Record<string, never>>(
  config: Record<string, CoreRouter<TCustomContext>>,
  options?: CreateDocsRouterOptions,
): ExpressRouter;
```

Returns a native Express `Router`; mount it with `app.use()`.

```typescript
const app = createServer({ "/api": api });
app.use(
  "/docs",
  createDocsRouter(
    { "/api": api },
    { title: "Users", version: "1.0.0" },
  ),
);
```

`CreateDocsRouterOptions` extends `GenerateOpenAPISpecOptions`:

| Property | Default | Effect |
| --- | --- | --- |
| `title` | `"API"` | OpenAPI title. |
| `version` | `"1.0.0"` | OpenAPI version string. |
| `description` | omitted | OpenAPI description. |
| `openapiPath` | `"openapi.json"` | JSON route relative to the mount; a leading slash is removed. |
| `enableDocs` | `true` | When false, omits Swagger UI at `/` but keeps the JSON route. |

The JSON spec is captured at helper creation. The UI derives an absolute spec URL from `req.protocol`, the `Host` header, and `req.baseUrl`, and loads Swagger UI 5.10.5 from `unpkg.com`. Configure Express proxy trust correctly if a reverse proxy terminates TLS and the generated URL must use HTTPS.

## Express-typed routing exports

### `ExpressBaseContext`

```typescript
interface ExpressBaseContext extends BaseContext {
  express: {
    req: Request;
    res: Response;
  };
}
```

### `Router<TCustomContext>`

A core `Router` subclass whose context generic defaults to `ExpressBaseContext` and whose second generic carries tracked route signatures. It adds no runtime members. See the [core Router reference](./core.md#routertcustomcontext).

### `router(config)`

Runs the core declarative router builder and returns the Express-typed subclass. Its generic must extend `ExpressBaseContext`.

### `createRouter(config?)`

Creates an empty Express-typed router or prefixes one router per config key. Its config accepts routers, not procedures or router arrays. Constructor-style routers are not tracked inputs for checked composition.

### `combineRouters(...routers)`

Combines one or more tracked declarative routers without prefixes. It rejects matching `METHOD + canonical path` signatures at compile time and repeats the check at runtime; the same path with different methods is valid. See [core `combineRouters()`](./core.md#combineroutersrouters) for canonicalization, metadata requirements, and migration examples.

## Core re-exports

All names below have the behavior documented in [Server core API](./core.md).

| Group | Re-exported names |
| --- | --- |
| Initialization | `init`, `publicProcedure`, `default400ErrorSchema`, `default500ErrorSchema`, `InitOptions`, `InitResult` |
| Result values/types | `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `mapError`, `catchError`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`, `tryCatch`, `tryCatchAsync`, `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`, `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, `NarrowError` |
| Middleware | `createMiddleware`, `createMiddlewareWithErrors`, `middlewareMarker`, `middlewareOk`, `MiddlewareFunction`, `MiddlewareBuilder`, `MiddlewareResult`, `MiddlewareResultSuccess`, `MiddlewareFunctionWithErrors`, `MiddlewareBuilderWithErrors`, `MiddlewareBuilderWithErrorsStaged`, `AnyMiddlewareBuilderWithErrors`, `AnyMiddlewareFunctionWithErrors`, `Overwrite` |
| Procedures/context | `BaseProcedureBuilder`, `ProcedureBuilder`, `InputConfig`, `TypedContext`, `BaseContext`, `InferInput`, `Procedure`, `ReadyProcedure`, `PendingProcedure`, `RouterContext`, `RouterRouteSignatures`, `RouteSignature`, `RouteSignaturesForConfig`, `ValidateRouterCombination`, `ValidateRouterConfig` |
| OpenAPI | `generateOpenAPISpec`, `OpenAPISpec`, `GenerateOpenAPISpecOptions`, `OpenAPIPathItem`, `OpenAPIOperation`, `OpenAPIParameter`, `OpenAPIRequestBody`, `OpenAPIResponse` |
| Validation | `validateInput`, `parseSchema`, `mergeInputs`, `ParseResult`, `StructuredInput` |
| Telemetry | `resolveTelemetryConfig`, `shouldIgnoreRoute`, `initTelemetry`, `createRequestSpan`, `endSpanWithError`, `setSpanOk`, `TelemetryConfig`, `TelemetryOption`, `ResolvedTelemetryConfig`, `Span` |
| Error tags | `extractTagsFromSchema`, `findHttpStatusForError` |

Express does **not** re-export core `withActiveSpan`, `RouterConfigValue`, or the additional core-only type utilities such as `HandlerResult`, `ValidateErrorConfig`, and path-param helper types.

## Related

- [Server quickstart](../quickstart.md)
- [Server common patterns](../common-patterns.md)
- [Core API](./core.md)
