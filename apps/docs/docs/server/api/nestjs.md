---
title: NestJS server API
description: Complete public API and runtime behavior for @alt-stack/server-nestjs.
---

# `@alt-stack/server-nestjs` API Documentation

```bash
pnpm add @alt-stack/server-nestjs @nestjs/common @nestjs/core @nestjs/platform-express express zod
```

The adapter supports NestJS 9, 10, or 11 on `@nestjs/platform-express`, Express 4 or 5, and Zod 4. It mounts the Express Altstack adapter into Nest; Fastify is not supported.

## `registerAltStack(app, config, options?)`

```typescript
function registerAltStack<TCustomContext extends object = {}>(
  app: NestAppLike,
  config: Record<
    string,
    | Router<NestBaseContext & TCustomContext>
    | Router<NestBaseContext & TCustomContext>[]
  >,
  options?: RegisterAltStackOptions<TCustomContext>,
): void;
```

Gets Nest's underlying Express application, creates an Altstack Express app, and mounts it with `expressApp.use(effectiveMountPath, altApp)`. It throws:

```text
@alt-stack/server-nestjs requires NestJS on the Express platform (@nestjs/platform-express).
```

when the HTTP adapter does not expose an Express-style `use()` function.

Call `app.setGlobalPrefix(...)` before `registerAltStack()` so the current prefix can be read.

### `RegisterAltStackOptions<TCustomContext>`

| Property | Default | Runtime behavior |
| --- | --- | --- |
| `mountPath` | `"/"` | Express mount beneath the Nest server. Leading/trailing slashes are normalized. |
| `createContext` | omitted | `(req, res) => TCustomContext \| Promise<TCustomContext>`. Runs through the Express adapter. |
| `defaultErrorHandlers` | omitted | Resolved 400/500 handlers, usually `factory.defaultErrorHandlers`. |
| `telemetry` | disabled | `boolean \| TelemetryConfig`, forwarded to Express. |
| `respectGlobalPrefix` | `true` | Prepends Nest's global prefix unless `mountPath` already equals or begins with it. |
| `docs` | omitted | Mounts the Express docs router beneath the effective mount path. |

The effective mount path rules are:

- no global prefix: normalized `mountPath`;
- prefix `v1` plus mount `/api`: `/v1/api`;
- prefix `v1` plus mount `/v1/api`: `/v1/api`, not `/v1/v1/api`;
- `respectGlobalPrefix: false`: only `mountPath`.

Request context is assembled in this order:

1. `options.createContext()` fields;
2. fields stored earlier by `createNestMiddleware()` (these win on duplicate keys);
3. adapter-owned `nest`, `express`, `input`, and `span` fields.

The generated docs spec uses the prefixes in `config`, not the effective Nest/Express `mountPath`. A global prefix and `mountPath` therefore do not appear automatically in `spec.paths`, even though the docs router itself is mounted beneath them.

### `RegisterAltStackDocsOptions`

This type is `CreateDocsRouterOptions` from the Express adapter plus:

| Property | Default | Effect |
| --- | --- | --- |
| `path` | `"/docs"` | Docs-router mount relative to the effective Altstack mount path. |
| `openapiPath` | `"openapi.json"` | OpenAPI JSON route relative to `path`. |
| `enableDocs` | `true` | Disables only Swagger UI when false. |
| `title` | `"API"` | OpenAPI title. |
| `version` | `"1.0.0"` | OpenAPI version string. |
| `description` | omitted | OpenAPI description. |

```typescript
registerAltStack(app as unknown as NestAppLike, { "/": api }, {
  mountPath: "/api",
  defaultErrorHandlers: factory.defaultErrorHandlers,
  docs: {
    path: "/docs",
    title: "Tasks API",
    version: "1.0.0",
  },
});
```

With global prefix `v1`, the UI is mounted at `/v1/api/docs` and JSON at `/v1/api/docs/openapi.json`.

## `NestAppLike`

The structural subset of a Nest application accepted by the adapter:

| Member | Purpose |
| --- | --- |
| `getHttpAdapter(): { getInstance(): unknown }` | Finds the underlying Express application. |
| `get(token, options?)` | Resolves normal providers. |
| `resolve?(token, contextId?, options?)` | Resolves request-scoped/transient providers. |
| `registerRequestByContextId?(request, contextId)` | Associates a request with a Nest context ID. |
| `getGlobalPrefix?()` | Reads a public/global-prefix implementation when available. |
| `config?.getGlobalPrefix?()` | Fallback used by current Nest versions/internals. |

The cast from a real `INestApplication` is structural integration glue used by the examples because Nest's public application type is broader than this small interface.

## `init(options?)`

```typescript
function init<TCustomContext extends object = Record<string, never>>(
  options?: InitOptions<NestBaseContext & TCustomContext>,
): InitResult<NestBaseContext & TCustomContext, typeof options>;
```

Unlike the core/adapters' plain re-export, the Nest wrapper automatically adds `NestBaseContext`. Pass only application fields:

```typescript
const factory = init<{ actor?: User }>();
```

The returned router/procedure context includes `nest` and `express`. `InitOptions`, callback probing, default-handler transfer, and OpenAPI caveats are otherwise the same as [core `init()`](./core.md#initoptions).

## Nest context types

### `NestBaseContext`

```typescript
interface NestBaseContext extends ExpressBaseContext {
  nest: NestServiceLocator;
}
```

It includes `ctx.express.req`, `ctx.express.res`, optional `ctx.span`, and `ctx.nest`.

### `NestServiceLocator`

```typescript
interface NestServiceLocator {
  get<T = unknown>(token: unknown): T;
  resolve<T = unknown>(token: unknown): Promise<T>;
}
```

`get()` first tries `app.get(token, { strict: false })`, then retries without options. Use it for regular providers.

`resolve()` uses `ContextIdFactory.getByRequest(req)`, registers the request with Nest when supported, and calls `app.resolve()` with the request context ID. The context ID and locator are cached on the request, so repeated `resolve()` calls and middleware/handler resolution share request-scoped instances. If `app.resolve` is absent, it falls back to `get()`.

## `createNestMiddleware(app, middlewareOrBuilder, options?)`

```typescript
function createNestMiddleware(
  app: NestAppLike,
  middlewareOrBuilder:
    | MiddlewareFunction<any, any, any>
    | MiddlewareBuilder<any, any>
    | AnyMiddlewareBuilderWithErrors,
  options?: CreateNestMiddlewareOptions,
): (req: Request, res: Response, next: NextFunction) => void;
```

Bridges Altstack procedure middleware into Nest's Express middleware pipeline. Apply the returned function with a Nest `MiddlewareConsumer` or Express `.use()`.

### `CreateNestMiddlewareOptions`

| Property | Default | Runtime behavior |
| --- | --- | --- |
| `errors` | omitted | Status-to-Zod-schema map for tagged error matching. A `MiddlewareBuilderWithErrors`'s own `_errors` takes precedence. |
| `includeInput` | `true` | Places raw, unvalidated `req.params`, `req.query`, and `req.body` on `ctx.input`; false sets all three to `undefined`. |
| `onError` | `"reply"` | `"reply"` sends the Altstack JSON error envelope; `"next"` calls `next(error)`. |

The bridge supplies `ctx.nest`, `ctx.express`, raw `ctx.input`, and `span: undefined`. It supports throwing middleware chains, Result-specific builders, a top-level tagged `Err`, and Web `Response` values. A Web `Response` has its status, headers, and body copied to Express.

Context passed through `next({ ctx: patch })` is accumulated. Reserved `nest`, `express`, `input`, and `span` keys are removed before the remaining fields are stored on the request. When the chain succeeds and no response was sent, the bridge calls Express `next()`.

If an object shaped like `MiddlewareBuilderWithErrors` has no `.fn(...)` result, invocation throws:

```text
@alt-stack/server-nestjs: MiddlewareBuilderWithErrors is missing a .fn(...) handler.
```

The staged public type normally prevents that state without a cast.

### Error replies

Tagged middleware errors use the same runtime envelope as route errors:

```json
{
  "error": {
    "code": "UnauthorizedError",
    "message": "Sign in required",
    "_tag": "UnauthorizedError"
  }
}
```

If no schema directly maps the tag, status 500 is used. See [core tag matching](./core.md#error-tag-utilities).

## Nest-typed routing exports

### `Router<TCustomContext>`

A core `Router` subclass whose generic defaults to `NestBaseContext`. It adds no runtime members.

### `router(config)`

Runs the core declarative router builder and returns the Nest-typed subclass. Its generic must extend `NestBaseContext`. When using the Nest `init()` wrapper, prefer `factory.router()` so base context is added automatically.

### `createRouter(config?)`

Creates an empty Nest-typed router or combines routers under prefixes. The config contains only routers or router arrays.

### `mergeRouters(...routers)`

Appends procedures to a new Nest-typed router without adding prefixes or detecting duplicates.

## Route runtime behavior

Routes registered through `registerAltStack()` use the Express adapter. Consequently:

- input is asynchronously parsed, but output validation is synchronous;
- only GET, POST, PUT, PATCH, and DELETE are registered;
- non-error successes are sent with `res.json()` at status 200;
- Web `Response` passthrough is not supported in procedure handlers;
- thrown/validation/declared error envelopes and OpenAPI mismatches match Express;
- telemetry spans use the effective mount path because Express supplies `req.baseUrl`.

## Core re-exports

All names below retain the behavior documented in [Server core API](./core.md).

| Group | Re-exported names |
| --- | --- |
| Initialization | `publicProcedure`, `default400ErrorSchema`, `default500ErrorSchema`, `InitOptions`, `InitResult` (`init` itself is the Nest wrapper above) |
| Result values/types | `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `mapError`, `catchError`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`, `tryCatch`, `tryCatchAsync`, `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`, `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, `NarrowError` |
| Middleware | `createMiddleware`, `createMiddlewareWithErrors`, `middlewareMarker`, `middlewareOk`, `MiddlewareFunction`, `MiddlewareBuilder`, `MiddlewareResult`, `MiddlewareResultSuccess`, `MiddlewareFunctionWithErrors`, `MiddlewareBuilderWithErrors`, `MiddlewareBuilderWithErrorsStaged`, `AnyMiddlewareBuilderWithErrors`, `AnyMiddlewareFunctionWithErrors`, `Overwrite` |
| Procedures/context | `BaseProcedureBuilder`, `ProcedureBuilder`, `InputConfig`, `TypedContext`, `BaseContext`, `InferInput`, `Procedure`, `ReadyProcedure`, `PendingProcedure`, `RouterConfigValue` |
| OpenAPI | `generateOpenAPISpec`, `OpenAPISpec`, `GenerateOpenAPISpecOptions`, `OpenAPIPathItem`, `OpenAPIOperation`, `OpenAPIParameter`, `OpenAPIRequestBody`, `OpenAPIResponse` |
| Validation | `validateInput`, `parseSchema`, `mergeInputs`, `ParseResult`, `StructuredInput` |
| Telemetry | `resolveTelemetryConfig`, `shouldIgnoreRoute`, `initTelemetry`, `createRequestSpan`, `endSpanWithError`, `setSpanOk`, `withActiveSpan`, `TelemetryConfig`, `TelemetryOption`, `ResolvedTelemetryConfig`, `Span` |
| Error tags | `extractTagsFromSchema`, `findHttpStatusForError` |

NestJS does not re-export the additional core-only type utilities such as `HandlerResult`, `ValidateErrorConfig`, and path-param helper types.

## Related

- [Server quickstart](../quickstart.md)
- [Server common patterns](../common-patterns.md)
- [Express API](./express.md)
- [Core API](./core.md)
