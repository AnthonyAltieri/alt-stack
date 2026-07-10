---
title: Bun server API
description: Complete public API and runtime behavior for @alt-stack/server-bun.
---

# `@alt-stack/server-bun` API Documentation

```bash
bun add @alt-stack/server-bun zod
```

This package is a Bun-native source package: its public export points at TypeScript source and `createServer()` uses the global `Bun.serve()`. Run it under Bun, not Node.js.

## `createServer(config, options?)`

```typescript
function createServer<TContext extends BunBaseContext = BunBaseContext>(
  config: Record<string, Router<TContext>>,
  options?: BunServerOptions<TContext>,
): BunServer;
```

Unlike the Hono and Express adapters, this function starts a listener immediately. Each prefix accepts one router; call `combineRouters()` before mounting multiple independent routers at the same prefix.

`BunServerOptions` is an anonymous public parameter shape:

| Property | Type / default | Runtime behavior |
| --- | --- | --- |
| `createContext` | `(req: Request, server: BunServer) => Omit<TContext, "bun" \| "span"> \| Promise<...>` | Runs after input validation for each matched route. |
| `defaultErrorHandlers` | resolved handlers from `init()` or the same shape | Customizes 400/500 payloads. Callback schemas are ignored when sending. |
| `telemetry` | `boolean \| TelemetryConfig`; default disabled | Creates OpenTelemetry server spans except ignored routes. |
| `port` | `number`; default `3000` | Passed to `Bun.serve()`. Use `0` for an ephemeral port in tests. |
| `hostname` | `string`; default `"0.0.0.0"` | Passed to `Bun.serve()`. |

```typescript
const server = createServer(
  { "/api": api },
  { port: 3000, hostname: "127.0.0.1" },
);

console.log(server.url.href);

// During shutdown or test cleanup:
server.stop();
```

The internal router matches exact HTTP methods and full paths. `{param}` segments match one non-slash segment and are decoded with `decodeURIComponent`. Only GET, POST, PUT, PATCH, and DELETE procedures are registered.

For a matched route the adapter:

1. parses the URL and collects query keys; later duplicate keys overwrite earlier values;
2. attempts `req.json()` and substitutes `{}` on failure;
3. validates input asynchronously;
4. supplies `ctx.bun.req`, `ctx.bun.server`, structured `ctx.input`, custom fields, and `ctx.span`;
5. runs middleware and the procedure;
6. passes `Ok<Response>` through, or validates the output synchronously and sends JSON.

An unmatched route returns status 404 with:

```json
{"error":{"code":"NOT_FOUND","message":"Not Found"}}
```

### Success and error behavior

- JSON responses use `Content-Type: application/json`.
- A declared `Err` is mapped by `_tag` and sent as `{ error: { code, message, ...enumerableProperties } }`.
- An unknown tag becomes status 500.
- Validation failures become 400; thrown middleware/context/handler/output errors become 500.
- Output validation uses synchronous `schema.parse()`; asynchronous output transforms are unsupported.
- Without a custom 500 handler, the thrown stack is included in `error.details`.

See [Error wire formats and OpenAPI](../common-patterns.md#error-wire-formats-and-openapi).

## `BunServer`

```typescript
type BunServer = Server<undefined>;
```

The type is Bun's `Server` without WebSocket data. The adapter exposes no WebSocket configuration. Standard members such as `url`, `port`, `hostname`, `stop()`, and `requestIP()` come from Bun's type/runtime.

## `BunBaseContext`

```typescript
interface BunBaseContext extends BaseContext {
  bun: {
    req: Request;
    server: BunServer;
  };
}
```

## `createDocsRouter(config, options?)`

```typescript
function createDocsRouter<TCustomContext extends object = Record<string, never>>(
  config: Record<string, CoreRouter<TCustomContext>>,
  options?: CreateDocsRouterOptions,
): CoreRouter<TCustomContext>;
```

Returns an Altstack core router. Include it in `createServer()`:

```typescript
const docs = createDocsRouter(
  { "/api": api },
  { title: "Users", version: "1.0.0" },
);

const server = createServer({ "/api": api, "/docs": docs });
```

`CreateDocsRouterOptions` extends `GenerateOpenAPISpecOptions`:

| Property | Default | Effect |
| --- | --- | --- |
| `title` | `"API"` | OpenAPI title. |
| `version` | `"1.0.0"` | OpenAPI version string. |
| `description` | omitted | OpenAPI description. |
| `openapiPath` | `"openapi.json"` | JSON path relative to the mount; a leading slash is removed. |
| `enableDocs` | `true` | When false, omits the root UI route but keeps the JSON route. |

The UI derives its spec URL from the incoming request URL and returns a Web `Response`. It loads Swagger UI 5.10.5 from `unpkg.com`. The OpenAPI object is captured when the helper runs.

## Bun-typed routing exports

### `Router<TCustomContext>`

A core `Router` subclass whose context generic defaults to `BunBaseContext` and whose second generic carries tracked route signatures. It adds no runtime members. See the [core Router reference](./core.md#routertcustomcontext).

### `router(config)`

Runs the core declarative router builder and returns the Bun-typed subclass. Its generic must extend `BunBaseContext`.

### `createRouter(config?)`

Creates an empty Bun-typed router or prefixes one router per config key. Its config accepts routers, not procedures or router arrays. Constructor-style routers are not tracked inputs for checked composition.

### `combineRouters(...routers)`

Combines one or more tracked declarative routers without prefixes. It rejects matching `METHOD + canonical path` signatures at compile time and repeats the check at runtime; the same path with different methods is valid. See [Combining routers](../combine-routers.md) for canonicalization, metadata requirements, migration, and troubleshooting.

## Core re-exports

All names below retain the behavior documented in [Server core API](./core.md).

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

Bun does **not** re-export core `withActiveSpan`, `RouterConfigValue`, or the additional core-only type utilities such as `HandlerResult`, `ValidateErrorConfig`, and path-param helper types.

## Related

- [Server quickstart](../quickstart.md)
- [Server common patterns](../common-patterns.md)
- [Core API](./core.md)
