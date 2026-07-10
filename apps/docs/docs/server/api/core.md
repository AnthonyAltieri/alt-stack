---
title: Server core API
description: Complete public API for @alt-stack/server-core.
---

# `@alt-stack/server-core` API Documentation

`@alt-stack/server-core` contains the framework-neutral router, procedure, middleware, validation, OpenAPI, telemetry, and Result contracts used by every HTTP adapter. Application code normally imports the same surface from its adapter package; custom adapter authors can depend on core directly.

```bash
pnpm add @alt-stack/server-core zod
```

Zod 4 is required. `@opentelemetry/api` 1.x is an optional peer used only when telemetry is enabled.

## Initialization

### `init(options?)`

```typescript
function init<TCustomContext extends object = Record<string, never>>(
  options?: InitOptions<TCustomContext>,
): InitResult<TCustomContext, typeof options>;
```

Creates one typed factory. The return type is `InitResult`; the returned object has:

| Property | Description |
| --- | --- |
| `router(config)` | Builds a `Router<TCustomContext>` from path/procedure entries and performs the public path-param type checks. |
| `mergeRouters(...routers)` | Appends all procedures to a new router. |
| `procedure` | A fresh `BaseProcedureBuilder` bound to `TCustomContext` and the configured default-error types. |
| `defaultErrorHandlers` | The resolved 400/500 callbacks plus their schemas. It is typed as optional but is always present at runtime. |

`InitOptions` has two optional callbacks:

| Option | Input | Return |
| --- | --- | --- |
| `default400Error` | an array of `[ZodError, "body" \| "param" \| "query", originalValue]` tuples | `[ZodObject, errorPayload]` |
| `default500Error` | the caught `unknown` value | `[ZodObject, errorPayload]` |

During `init()`, a custom 400 callback is called once with `[]`, and a custom 500 callback is called once with `null`, to obtain their schemas. These callbacks must tolerate those probe values and should not perform one-time side effects.

The handlers are not connected to an adapter automatically. Pass `factory.defaultErrorHandlers` to `createServer()`, `registerAltStack()`, or TanStack route options. The returned schemas affect TypeScript inference, but core does not merge them into procedure runtime config or generated OpenAPI responses.

### `publicProcedure`

A singleton `BaseProcedureBuilder` with empty custom context and type-level default 400/500 schemas. It is useful for context-free routes. It does not install runtime error handlers in an adapter.

### `default400ErrorSchema`

```typescript
z.object({
  _tag: z.literal("ValidationError"),
  message: z.string(),
  details: z.array(z.string()),
});
```

### `default500ErrorSchema`

The same property shape with `_tag: "InternalServerError"`. The built-in 500 instance uses the thrown `Error.message` and includes its stack in `details`; non-`Error` values use `"Internal server error"` and an empty array.

## Routers

### `router(config)`

Builds a router from a declarative config. Each key can contain:

- a ready procedure created by `.get()`, `.post()`, `.put()`, `.patch()`, or `.delete()`;
- a lowercase methods object containing pending `.handler()` procedures; or
- a nested `Router`, in which case the key is a prefix.

Paths are normalized to start with `/`. A `{param}` path requires `input.params` with that key at compile time. The check does not reject additional params keys, and a TypeScript limitation means not every invalid generic call produces an immediate call-site diagnostic.

### `createRouter(config?)`

```typescript
function createRouter<TCustomContext extends object = Record<string, never>>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext>;
```

Creates an empty router or merges nested routers under the supplied prefixes. This constructor-style helper does not accept procedure entries; use `router()` for a route config.

### `mergeRouters(...routers)`

Returns a new router and appends every source procedure in argument order without adding a prefix or checking duplicates. Source routers are not mutated.

### `Router<TCustomContext>`

```typescript
new Router(config?);
```

The public members are:

| Member | Behavior |
| --- | --- |
| `constructor(config?)` | Accepts the same prefix-to-router or prefix-to-router-array map as `createRouter()`. |
| `registerProcedure(path, readyProcedure)` | Normalizes `path`, converts a ready procedure to a stored `Procedure`, appends it, and returns `this`. |
| `registerPendingProcedure(path, method, pendingProcedure)` | Uppercases `method`, materializes the pending procedure, appends it, and returns `this`. |
| `register(procedure)` | Appends an already materialized procedure and returns `this`. |
| `merge(prefix, router)` | Copies the other router's procedures with the normalized prefix and returns `this`. |
| `getProcedures()` | Returns the router's mutable internal procedure array. Treat it as read-only unless implementing an adapter. |
| `procedure` | Creates a new base builder bound to this router's context type. The builder is not auto-registered; put its ready/pending result in `router()` or call a low-level registration method. |

`registerProcedure()` and `registerPendingProcedure()` currently omit the `middlewareWithErrorsFlags` property when materializing the stored procedure. See the [middleware limitation](../common-patterns.md#reusable-middleware-builders).

### `RouterConfigValue<TCustomContext>`

A structural union of `ReadyProcedure`, a lowercase method map, or `Router<TCustomContext>`. It describes one router config value; it does not apply the path-param validation by itself.

## Procedure builders

### `BaseProcedureBuilder`

The main immutable builder. Its generic parameters track base input, output, errors, custom context, an optional router, default errors, and middleware errors.

| Method | Result |
| --- | --- |
| `input({ params?, query?, body? })` | Merges supplied sections into prior input; a later section replaces the same earlier section. `params` and `query` object fields must accept strings. |
| `output(schema)` | Replaces the output schema and constrains the `Ok` value type. |
| `errors(record)` | Merges numeric status-to-Zod-schema entries. Every schema must infer a direct literal `_tag`. Later runtime entries overwrite the same status. |
| `use(middlewareOrBuilder)` | Appends middleware and carries its context override and declared errors into later types. |
| `on(router)` | Returns a builder with the router in its generic/runtime field. It currently has no effect on `.get()`/`.handler()` output and does not register a procedure; avoid it in application code. |
| `get(handler)` | Returns a `ReadyProcedure` with method `GET`. |
| `post(handler)` | Returns a `ReadyProcedure` with method `POST`. |
| `put(handler)` | Returns a `ReadyProcedure` with method `PUT`. |
| `patch(handler)` | Returns a `ReadyProcedure` with method `PATCH`. |
| `delete(handler)` | Returns a `ReadyProcedure` with method `DELETE`. |
| `handler(handler)` | Returns a `PendingProcedure`; a containing methods-object key chooses the HTTP method. |

Every handler receives `{ input, ctx }` and returns `Result` or `Promise<Result>`. When an output schema exists, the `Ok` value is `z.infer<typeof schema>`. Declared schema tags constrain the `Err` error union. Without an output schema the success value is `unknown`, which permits native `Response` values on adapters that support them.

The public constructor accepts `baseConfig`, middleware, an optional router, middleware errors, and Result-middleware flags. Those arguments are low-level adapter/building mechanics; prefer `init().procedure`, `publicProcedure`, or `Router.procedure`.

`BaseProcedureBuilder.constructor` copies the optional base input/output/error config, middleware array, accumulated middleware-error schemas, and Result-middleware flags into a new immutable-builder stage; an optional low-level router reference is retained for `.on(...)` plumbing.

### `ProcedureBuilder`

A separate mutable, low-level builder retained in the public API:

```typescript
new ProcedureBuilder(method, path, config, router, initialMiddleware?);
```

- `use(middleware)` mutates the middleware list and returns `this`.
- `handler(fn)` stores the handler, registers the built procedure once, and returns the supplied router.
- `build()` returns the materialized `Procedure` or throws `Error("Handler not defined for METHOD PATH")`.

No public factory constructs this class, and it does not expose the modern input/output/error chaining API. New application code should use `BaseProcedureBuilder`.

## Procedure and context types

| Type | Meaning / properties |
| --- | --- |
| `InputConfig` | `{ params?: ZodType; query?: ZodType; body?: ZodType }`. |
| `InferInput<T>` | `{ params, query, body }`, each inferred from its schema or `undefined`. |
| `InferOutput<TSchema>` | Alias for `z.infer<TSchema>`. |
| `BaseContext` | `{ span?: Span }`; framework adapters extend it. |
| `TypedContext<TInput, TErrors, TCustomContext>` | Intersection of `BaseContext`, custom context, and `{ input: InferInput<TInput> }`. `TErrors` is currently a typing parameter but adds no property. |
| `StringInputObjectSchema<T>` | Returns `T` only when every object input field can accept a string; otherwise `never`. |
| `HandlerResult<TErrors, TOutput>` | `Result<inferred output or unknown, error constrained by declared tags>`. |
| `ProcedureConfig<TPath, TInput, TOutput, TErrors>` | `{ input, output?, errors? }` with path-param input validation. |
| `Procedure` | Stored runtime object: `method`, `path`, `config`, context-style `handler(ctx)`, and `middleware`. |
| `ReadyProcedure` | Router-config object: `method`, `config`, `handler({ input, ctx })`, `middleware`, and optional `middlewareWithErrorsFlags`. |
| `PendingProcedure` | Same as ready without `method`; a methods object supplies it. |
| `ExtractPathParams<TPath>` | Union of names inside every `{name}` segment. |
| `RequireParamsForPath<TPath, TParams>` | Keeps `TParams` when all path names are present; otherwise `never`. |
| `ValidateInputForPath<TPath, TInput>` | Keeps a complete input config or produces `never`. |
| `InputConfigForPath<TPath>` | Makes a compatible `params` schema required for parameterized paths. |

For the pending shape, `PendingProcedure.config` holds the accumulated `input`, optional `output`, and optional error schemas; `PendingProcedure.middleware` preserves the ordered runtime middleware array; and `PendingProcedure.middlewareWithErrorsFlags` optionally parallels that array to identify Result-based middleware. Current router materialization drops the flags as noted above.

### Error-schema types

| Type | Meaning |
| --- | --- |
| `InferErrorSchemas<T>` | Maps each status key to the schema's inferred payload. |
| `ErrorUnion<T>` | Union of all inferred payload values. |
| `HasTagLiteral<T>` | Keeps schemas whose inferred `_tag` is a string literal, otherwise `never`. |
| `ValidateErrorConfig<T>` | Applies `HasTagLiteral` to every status entry. |

These are compile-time utilities. Runtime status matching has the narrower direct-Zod-object limitation described under `extractTagsFromSchema()`.

## Middleware

### `createMiddleware<TContext>()`

Returns a function that turns one `MiddlewareFunction` into a `MiddlewareBuilder`. Call `.pipe(fnOrBuilder)` to append a chain while accumulating context override types. A middleware receives `{ ctx, next }`; `next()` may receive `{ ctx: patch }` and returns a `MiddlewareResult` marker wrapper.

### `createMiddlewareWithErrors<TContext>()`

Returns a staged builder:

```typescript
createMiddlewareWithErrors<TContext>()
  .errors({ 401: schema })
  .fn(async ({ ctx, next }) => /* Result */);
```

`.errors()` requires direct literal `_tag` schemas. `.fn()` returns `MiddlewareBuilderWithErrors`, whose `.errors()` can start another staged replacement and whose public `_errors` and `_fn` fields are consumed by adapters. Errors are merged into procedure config when passed to `.use()`.

### `middlewareOk(ctx)`

Returns `ok({ marker: middlewareMarker, ctx })`. It is the success value expected by Result-specific middleware `next()` implementations.

### `middlewareMarker`

The branded string `"middlewareMarker"`. Adapters use it to distinguish middleware protocol payloads from ordinary values. It is exported for adapter authors; application middleware should normally return `next()` or `middlewareOk()` rather than inspect it.

### Middleware types

| Type | Meaning / public properties |
| --- | --- |
| `Overwrite<T, U>` | Replaces keys in `T` with keys from object `U`; non-object `U` leaves `T` unchanged. |
| `MiddlewareFunction` | Async throwing/legacy middleware with overloaded `next()`; it may also return a `Result`. |
| `MiddlewareBuilder` | Reusable chain with `.pipe()` and public adapter-facing `_middlewares`. |
| `MiddlewareResult` | `{ marker, ok: true, data }`, returned by legacy `next()`. |
| `MiddlewareResultSuccess` | `{ marker, ctx }`, wrapped in `Ok` by Result-specific `next()`. |
| `MiddlewareFunctionWithErrors` | Async function returning `Result<MiddlewareResultSuccess, ResultError>`. |
| `MiddlewareBuilderWithErrorsStaged` | Has `.fn()` after `.errors()` has supplied schemas. |
| `MiddlewareBuilderWithErrors` | Has `.errors()`, `_errors`, and `_fn`. |
| `AnyMiddlewareBuilderWithErrors` | Type-erased builder alias for adapter code. |
| `AnyMiddlewareFunctionWithErrors` | Type-erased function alias for adapter code. |

## Validation utilities

### `parseSchema(schema, data)`

Runs `schema.safeParseAsync(data)` and resolves to `ParseResult<z.infer<typeof schema>>`:

```typescript
interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: { message: string; details?: unknown };
}
```

Zod failures use message `"Validation failed"` and put the full `ZodError` in `details`. An exception thrown by the schema is caught and returned with its message but without `details`.

### `validateInput(config, params, query, body)`

Validates every configured section, accumulates Zod failures, and resolves to:

```typescript
interface StructuredInput {
  params: unknown;
  query: unknown;
  body: unknown;
}
```

The exported `StructuredInput` interface is intentionally untyped at this low-level boundary; procedure generics supply the useful inferred handler types.

Unconfigured sections are `undefined`. One or more Zod failures throw an internal `Error` named `"ValidationError"` with `details.errors` containing `[ZodError, variant, originalValue]` tuples. That error class is intentionally not exported. A non-Zod exception caught by `parseSchema()` has no `ZodError` details, so `validateInput()` currently does not add it to the accumulated failures and may return that section as `undefined`.

### `mergeInputs(params, query, body)`

Flattens input into a new object. Query keys overwrite params; keys from an object body overwrite both. A null, array, or primitive body is stored under the `body` key instead.

## Error tag utilities

### `extractTagsFromSchema(schema)`

Returns the string values from a direct object schema's `_tag` literal. It reads Zod internals (`values` in Zod 4, with older `_def` fallbacks). It returns `[]` for non-objects, missing/nonliteral tags, and currently for Zod union/discriminated-union wrappers.

### `findHttpStatusForError(tag, errorSchemas)`

Iterates status entries in object order and returns the first status whose extracted tags include `tag`. It returns 500 when the map is absent, empty, or has no match.

## OpenAPI

### `generateOpenAPISpec(config, options?)`

```typescript
function generateOpenAPISpec<TContext extends object>(
  config: Record<string, Router<TContext> | Router<TContext>[]>,
  options?: GenerateOpenAPISpecOptions,
): OpenAPISpec;
```

`GenerateOpenAPISpecOptions` properties:

| Property | Default | Effect |
| --- | --- | --- |
| `title` | `"API"` | `info.title` |
| `version` | `"1.0.0"` | `info.version` |
| `description` | omitted | `info.description` when truthy |

The generator emits OpenAPI `3.0.0`. It normalizes prefixes, preserves `{param}` paths, emits path/query parameters, makes every configured body required, emits one success response at status 200, and emits declared error statuses. It converts Zod schemas through `z.toJSONSchema(..., { target: "openapi-3.0" })`; conversion errors log a warning and fall back to `{ type: "object" }`.

Operation IDs are the lowercase method followed by Pascal-cased path segments; braces are removed. For example, `GET /api/job-types/{id}` becomes `getApiJobTypesId`. Hyphens and underscores are word separators.

Identical JSON schemas are deduplicated by `JSON.stringify` and referenced from `components.schemas`. Name collisions receive a numeric suffix.

Current contract gaps:

- only GET, POST, PUT, PATCH, and DELETE are modeled;
- successful responses are always documented as 200;
- automatic validation/uncaught errors are omitted;
- declared error schemas are documented as flat bodies although adapters wrap them under `error`;
- generated operations do not set `summary`, `description`, `tags`, security, headers, cookies, or servers;
- duplicate method/path entries overwrite in collection order.

### OpenAPI types

| Type | Public properties |
| --- | --- |
| `OpenAPISpec` | `openapi`, `info: { title, version, description? }`, `paths`, optional `components.schemas`. |
| `OpenAPIPathItem` | optional `get`, `post`, `put`, `patch`, `delete`, and path-level `parameters`. |
| `OpenAPIOperation` | optional `operationId`, `summary`, `description`, `tags`, `parameters`, `requestBody`; required `responses`. |
| `OpenAPIParameter` | `name`, `in: "path" \| "query" \| "header" \| "cookie"`, `required`, optional `description`, and JSON `schema`. |
| `OpenAPIRequestBody` | optional `required`; JSON `content` whose schema is inline or `$ref`. |
| `OpenAPIResponse` | `description`; optional JSON `content` whose schema is inline or `$ref`. |

## Telemetry

### Configuration types

The exported types are `TelemetryConfig`, `TelemetryOption`, and `ResolvedTelemetryConfig`:

```typescript
interface TelemetryConfig {
  enabled: boolean;
  serviceName?: string;
  ignoreRoutes?: string[];
}

type TelemetryOption = boolean | TelemetryConfig;

interface ResolvedTelemetryConfig {
  enabled: boolean;
  serviceName: string;
  ignoreRoutes: string[];
}
```

`Span` is re-exported from `@opentelemetry/api` for `ctx.span` typing.

### `resolveTelemetryConfig(option)`

Normalizes `undefined`/`false` to disabled and `true` to enabled. Defaults are `serviceName: "altstack-server"` and `ignoreRoutes: []`. An object preserves its required `enabled` and fills missing optional values.

### `shouldIgnoreRoute(path, config)`

Returns true for an exact ignored route or a subpath separated by `/`. `/health/check` matches `/health`; `/healthz` does not.

### `initTelemetry()`

Lazily imports `@opentelemetry/api`, caches the result, and resolves to whether the import succeeded. Call and await it before `createRequestSpan()`; later calls reuse the cached outcome.

### `createRequestSpan(method, route, urlPath, config)`

Returns `undefined` until telemetry has loaded. Otherwise starts a SERVER span named `METHOD route` from the tracer named by `config.serviceName`, with `http.request.method`, `http.route`, and `url.path` attributes. This low-level helper does not inspect `config.enabled` or `ignoreRoutes`; the caller must do that.

### `endSpanWithError(span, error)`

Sets ERROR status and records the `Error` or its string form. It does not end the span.

### `setSpanOk(span)`

Sets OK status when both a span and loaded OpenTelemetry API are available. It does not end the span.

### `withActiveSpan(span, fn)`

Runs `fn` with the span in OpenTelemetry's active context, preserving `fn`'s return type. If no API or span is available, it calls `fn` directly.

## Result re-exports

Core re-exports a deliberate subset of `@alt-stack/result` so server modules can use one import. The behavior is identical to the Result package.

| Export | Description |
| --- | --- |
| `Result`, `Ok`, `Err`, `ResultError` | Tagged success/failure union and its constituent shapes; an error is an `Error` with string `_tag`. |
| `TaggedError` | Abstract `Error` base whose `name` getter follows `_tag`. |
| `ok`, `err` | Construct `Ok` and `Err` values. |
| `isOk`, `isErr` | Narrow a `Result` by its outer `_tag`. |
| `map`, `flatMap` | Transform an `Ok`; `flatMap` can add an error variant. |
| `mapError`, `catchError` | Transform or recover from an `Err`. |
| `unwrap`, `unwrapOr`, `unwrapOrElse` | Extract success, throw the error, or provide a fallback. |
| `match`, `fold` | Collapse both variants through callbacks; `fold` requires one output type. |
| `tryCatch`, `tryCatchAsync` | Convert thrown synchronous/async work to a mapped tagged error. |
| `isResultError`, `assertResultError` | Runtime guard/assertion requiring an actual `Error` with string `_tag`; the assertion throws `TypeError`. |
| `ResultAggregateError` | Tagged error with public `errors: ResultError[]`; useful when constructing an aggregate directly. Core does not re-export `firstOk`. |
| `InferErrorTag`, `InferErrorTags`, `NarrowError` | Extract one/all literal tags or select an error union member by tag. |

For full Result signatures, see [Result API Documentation](../../result/api.md).

## Adapter-author checklist

An adapter should collect `Router.getProcedures()`, normalize configured prefixes, supply structured raw input to `validateInput()`, construct its framework context plus `input`/`span`, run middleware in order, require a `Result` from the handler, map declared error tags through `findHttpStatusForError()`, validate output, and close telemetry spans on every path. The existing adapter pages document where current implementations intentionally or accidentally differ.
