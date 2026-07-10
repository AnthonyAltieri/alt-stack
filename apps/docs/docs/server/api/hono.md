---
title: Hono server API
description: Complete public API and runtime behavior for @alt-stack/server-hono.
---

# `@alt-stack/server-hono` API Documentation

```bash
pnpm add @alt-stack/server-hono hono zod
```

The adapter supports Hono 4 and Zod 4. It returns a Hono app but does not choose a deployment runtime; use the relevant Hono host adapter, such as `@hono/node-server`, or export `app.fetch` where your platform expects it.

## `createServer(config, options?)`

```typescript
function createServer<TContext extends HonoBaseContext = HonoBaseContext>(
  config: Record<string, Router<TContext> | Router<TContext>[]>,
  options?: HonoServerOptions<TContext>,
): Hono;
```

`HonoServerOptions` is an anonymous public parameter shape rather than a named export:

| Property | Type / default | Runtime behavior |
| --- | --- | --- |
| `createContext` | `(c: Context) => Omit<TContext, "hono" \| "span"> \| Promise<...>` | Runs after input validation for every matched procedure. Its fields are spread before adapter-owned context. |
| `middleware` | map of path to `{ methods: string[]; handler(c): Response \| Promise<Response> }` | Registers native Hono handlers before Altstack routes. `"*"` uses `app.use`; other paths use `app.on(methods, path, handler)`. |
| `docs` | `{ path?: string; openapiPath?: string }` | **Currently unused.** It does not create or mount docs. Use `createDocsRouter()` explicitly. |
| `defaultErrorHandlers` | resolved handlers from `init()` or the same shape | Customizes validation and uncaught-error payloads. Both callbacks are required when the object is supplied; schema properties are optional and ignored by the adapter. |
| `telemetry` | `boolean \| TelemetryConfig`; default disabled | Creates OpenTelemetry server spans except ignored routes. |

The adapter:

1. normalizes each config key as a route prefix and converts `{param}` to Hono's `:param` syntax;
2. reads params and one Hono query object;
3. attempts `c.req.json()` for every procedure and substitutes `{}` when it fails;
4. validates input asynchronously;
5. supplies `ctx.hono`, structured `ctx.input`, optional custom fields, and `ctx.span`;
6. runs procedure middleware and the handler;
7. passes an `Ok<Response>` through unchanged, otherwise validates output synchronously and sends JSON.

Only GET, POST, PUT, PATCH, and DELETE procedures are registered. Unknown routes use Hono's normal 404 behavior.

### Success and error behavior

- A handler must return an Altstack `Result`.
- Declared `Err` values are mapped by their error `_tag` and serialized as `{ error: { code, message, ...enumerableProperties } }`.
- An unmatched tag becomes status 500.
- Input validation failures become status 400.
- Thrown middleware, context, handler, or output-validation errors become status 500.
- Without custom handlers, the fallback 500 response exposes the thrown stack in `error.details`.
- Hono uses synchronous `output.parse()`, so do not use asynchronous output transforms.

See [Error wire formats and OpenAPI](../common-patterns.md#error-wire-formats-and-openapi) for the schema mismatch.

### Native Hono middleware

The declared `middleware` handler accepts one `Context` argument. Runtime code special-cases a JavaScript function whose `.length` is 2 as Hono `(c, next)` middleware, but that two-argument form is not represented by the public TypeScript option. Prefer attaching fully typed Hono middleware to the returned app when you need Hono's native middleware signature:

```typescript
const app = createServer({ "/api": api });
app.use("*", logger());
```

Native handlers supplied through `options.middleware` are registered before Altstack routes and can short-circuit them.

## `createDocsRouter(config, options?)`

```typescript
function createDocsRouter<TCustomContext extends object = Record<string, never>>(
  config: Record<string, CoreRouter<TCustomContext> | CoreRouter<TCustomContext>[]>,
  options?: CreateDocsRouterOptions,
): CoreRouter<TCustomContext>;
```

Returns an Altstack core router, not a native Hono router. Mount it in the same `createServer()` config.

`CreateDocsRouterOptions` extends `GenerateOpenAPISpecOptions`:

| Property | Default | Effect |
| --- | --- | --- |
| `title` | `"API"` | OpenAPI title. |
| `version` | `"1.0.0"` | OpenAPI version string. |
| `description` | omitted | OpenAPI description. |
| `openapiPath` | `"openapi.json"` | JSON route relative to the docs mount; a leading slash is removed. |
| `enableDocs` | `true` | When false, omits the root Swagger UI route but keeps the JSON route. |

The UI route returns HTML via `ctx.hono.html()`. It loads Swagger UI 5.10.5 CSS and scripts from `unpkg.com`. The OpenAPI document is captured when `createDocsRouter()` runs; later router mutation is not reflected.

```typescript
const docs = createDocsRouter(
  { "/api": api },
  { title: "Users", version: "1.0.0" },
);
const app = createServer({ "/api": api, "/docs": docs });
```

## Hono-typed routing exports

### `HonoBaseContext`

```typescript
interface HonoBaseContext extends BaseContext {
  hono: Context;
}
```

Handlers can access the native request, response helpers, environment, and variables through `ctx.hono`.

### `Router<TCustomContext>`

A subclass of the core `Router` whose generic defaults to `HonoBaseContext`. It adds no runtime members. All inherited public methods are documented in the [core Router reference](./core.md#routertcustomcontext).

### `router(config)`

Calls core `router()` and casts the result to the Hono-typed subclass. The generic must extend `HonoBaseContext`. Use it when importing the standalone helper rather than `init<AppContext>().router`.

### `createRouter(config?)`

Creates an empty Hono-typed router or combines routers under prefixes. Its config accepts only `Router` or `Router[]`, not procedures.

### `mergeRouters(...routers)`

Appends procedures into a new Hono-typed router without prefixes or duplicate detection.

## Core re-exports

The following exports keep their core behavior. Follow the links for signatures, properties, and caveats.

| Group | Re-exported names |
| --- | --- |
| Initialization | `init`, `publicProcedure`, `default400ErrorSchema`, `default500ErrorSchema`, `InitOptions`, `InitResult` |
| Result values/types | `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `mapError`, `catchError`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`, `tryCatch`, `tryCatchAsync`, `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`, `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, `NarrowError` |
| Middleware | `createMiddleware`, `createMiddlewareWithErrors`, `middlewareMarker`, `middlewareOk`, `MiddlewareFunction`, `MiddlewareBuilder`, `MiddlewareResult`, `MiddlewareResultSuccess`, `MiddlewareFunctionWithErrors`, `MiddlewareBuilderWithErrors`, `MiddlewareBuilderWithErrorsStaged`, `AnyMiddlewareBuilderWithErrors`, `AnyMiddlewareFunctionWithErrors`, `Overwrite` |
| Procedures/context | `BaseProcedureBuilder`, `ProcedureBuilder`, `InputConfig`, `TypedContext`, `BaseContext`, `InferInput`, `Procedure`, `ReadyProcedure`, `PendingProcedure`, `RouterConfigValue` |
| OpenAPI | `generateOpenAPISpec`, `OpenAPISpec`, `GenerateOpenAPISpecOptions`, `OpenAPIPathItem`, `OpenAPIOperation`, `OpenAPIParameter`, `OpenAPIRequestBody`, `OpenAPIResponse` |
| Validation | `validateInput`, `parseSchema`, `mergeInputs`, `ParseResult`, `StructuredInput` |
| Telemetry | `resolveTelemetryConfig`, `shouldIgnoreRoute`, `initTelemetry`, `createRequestSpan`, `endSpanWithError`, `setSpanOk`, `TelemetryConfig`, `TelemetryOption`, `ResolvedTelemetryConfig`, `Span` |
| Error tags | `extractTagsFromSchema`, `findHttpStatusForError` |

Hono does **not** re-export core `withActiveSpan` or the additional core-only type utilities such as `HandlerResult`, `ValidateErrorConfig`, and path-param helper types. Import those from `@alt-stack/server-core` when required.

## Related

- [Server quickstart](../quickstart.md)
- [Server common patterns](../common-patterns.md)
- [Core API](./core.md)
