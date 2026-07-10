---
title: TanStack Start server API
description: Complete public API and runtime behavior for @alt-stack/server-tanstack-start.
---

# `@alt-stack/server-tanstack-start` API Documentation

```bash
pnpm add @alt-stack/server-tanstack-start @tanstack/react-router zod
```

The adapter targets TanStack Start's file-route `server.handlers` API through `@tanstack/react-router`. It does not start an HTTP server or expose a docs UI.

## `createAltStackFileRoute(path)`

```typescript
function createAltStackFileRoute<TFilePath extends keyof FileRoutesByPath & string>(
  path: TFilePath,
): (options: AltStackFileRouteOptions<...>) => AltStackFileRoute<...>;
```

A curried wrapper around TanStack's `createFileRoute(path)`. The path must be present in TanStack's generated `FileRoutesByPath` augmentation. The returned TanStack route also has `.altStack` metadata for OpenAPI and direct handler access.

```typescript
export const Route = createAltStackFileRoute("/api/users/$id")({
  component: UserPage,
  staticData: { section: "users" },
  server: {
    handlers: {
      GET: procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .handler(({ input }) => ok({ id: input.params.id })),
    },
  },
});

Route.altStack.path; // "/api/users/$id"
Route.altStack.router; // core Router containing /api/users/{id}
Route.altStack.server.handlers.GET; // TanStack server handler
```

Use uppercase `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` keys and pending `.handler()` procedures. A ready `.get()` procedure already owns a method and is not the shape accepted by `TanStackRouteMethods`.

### `AltStackFileRouteOptions`

This type preserves TanStack's open route/server option space while requiring:

```typescript
{
  server: {
    handlers: TanStackRouteMethods;
    createContext?: CreateTanStackRouteHandlersOptions["createContext"];
    defaultErrorHandlers?: CreateTanStackRouteHandlersOptions["defaultErrorHandlers"];
    // other TanStack server options are allowed
  };
  // other createFileRoute options are allowed
}
```

Top-level options and extra server options are forwarded to `createFileRoute()`. Altstack consumes `handlers`, `createContext`, and `defaultErrorHandlers`; it replaces the handler values with adapted TanStack handlers.

### Dynamic path validation

TanStack `$id` becomes OpenAPI `{id}` and requires `input.params.id`. A bare `$` splat becomes `{_splat}` and requires `input.params._splat`. This is a compile-time check on every supplied procedure.

## `defineServerRoute(path, methods, options?)`

```typescript
function defineServerRoute<...>(
  path: TPath,
  methods: TMethods & ValidateMethodsForTanStackPath<TPath, TMethods>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): DefinedTanStackServerRoute<TPath, TParams, TRouteContext, TContext>;
```

Creates the same adapted server handlers and OpenAPI router without calling `createFileRoute()`. Use it when another layer owns route creation or in tests.

`DefinedTanStackServerRoute` properties:

| Property | Value |
| --- | --- |
| `path` | Original TanStack-style path. |
| `server` | `{ handlers }` in TanStack's uppercase method shape. |
| `router` | Core router with the path converted to OpenAPI braces. |

## `CreateTanStackRouteHandlersOptions`

| Property | Type / behavior |
| --- | --- |
| `createContext` | Receives `{ request, params, context }` and returns application fields, synchronously or asynchronously. Do not return `tanstack` or `span`. |
| `defaultErrorHandlers` | Resolved `default400Error`/`default500Error` callbacks plus optional schemas. The adapter ignores returned schemas when sending. |

There is no `telemetry` option. The runtime does not initialize or create a request span, so `ctx.span` is absent/undefined unless application context supplies one itself.

## Request execution

Each adapted handler receives `TanStackServerRouteHandlerArgs` and:

1. uses `args.params` as raw path params;
2. parses query keys from `request.url`, preserving repeated keys as arrays;
3. skips body reading when no body schema exists;
4. parses JSON when content type includes `application/json`, otherwise reads text;
5. validates all configured input with async Zod parsing;
6. calls `createContext`, then installs adapter-owned `ctx.tanstack` and `ctx.input`;
7. runs procedure middleware and the handler;
8. passes a Web `Response` through or validates the output with `parseAsync()` and sends JSON.

JSON responses use `content-type: application/json; charset=utf-8` and status 200 unless an error is selected.

### Errors

Declared tagged errors map to their configured status and the shared envelope:

```json
{
  "error": {
    "code": "NotFoundError",
    "message": "Resource missing not found",
    "_tag": "NotFoundError",
    "resourceId": "missing"
  }
}
```

Validation failures become 400 and uncaught failures become 500. Without custom handlers, the 500 `details` array includes an `Error` stack. With handlers, the payload is `{ error: instance }`. Status matching and generated OpenAPI have the limitations documented in [Error wire formats and OpenAPI](../common-patterns.md#error-wire-formats-and-openapi).

## `generateOpenAPISpecFromServerRoutes(routes, options?)`

```typescript
function generateOpenAPISpecFromServerRoutes(
  routes: readonly (
    | DefinedTanStackServerRoute<string, ...>
    | AltStackFileRouteMetadata<string, ...>
  )[],
  options?: GenerateOpenAPISpecOptions,
): OpenAPISpec;
```

Accepts values returned by `defineServerRoute()` or full file routes returned by `createAltStackFileRoute()`. It collects each route's attached core router and delegates to core `generateOpenAPISpec()` under the root prefix.

```typescript
const spec = generateOpenAPISpecFromServerRoutes(
  [listUsersRoute, getUserRoute],
  { title: "Users API", version: "1.0.0" },
);
```

Options are `title`, `version`, and `description`. TanStack `$` paths have already been converted in the attached routers. The same core gaps remain: success status is always documented as 200, default errors are omitted, and declared error schemas are flat while runtime bodies are enveloped. Serve or write the returned object yourself.

## Path utilities

### `tanStackPathToOpenApiPath(path)`

Converts each slash-delimited segment:

| TanStack segment | OpenAPI segment |
| --- | --- |
| `$id` | `{id}` |
| `$` | `{_splat}` |
| ordinary text | unchanged |

It does not normalize leading/trailing slashes or URL-decode segments.

### `TanStackPathToOpenApiPath<TPath>`

The type-level equivalent of `tanStackPathToOpenApiPath()`.

### `ExtractTanStackPathParams<TPath>`

Returns the union of parameter names from `$name` segments, with `_splat` for `$`. It returns `never` for a static path.

## Public TanStack types

| Type | Shape / purpose |
| --- | --- |
| `TanStackRouteParams` | `Record<string, string \| undefined>`. |
| `TanStackServerRouteHandlerArgs<TParams, TRouteContext>` | `{ request: Request; params: TParams; context: TRouteContext }`. |
| `TanStackServerRouteHandler<TParams, TRouteContext>` | Function from those args to `Response \| Promise<Response>`. |
| `TanStackHttpMethod` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"`. |
| `TanStackServerRoute<TParams, TRouteContext>` | `{ handlers: Partial<Record<TanStackHttpMethod, TanStackServerRouteHandler>> }`. |
| `TanStackBaseContext<TParams, TRouteContext>` | Extends `BaseContext` with `tanstack: { request, params, context }`. |
| `TanStackRouteMethods` | Uppercase method map whose values are core `PendingProcedure` objects. |
| `DefinedTanStackServerRoute` | Original path plus adapted `server` and attached core `router`. |
| `AltStackFileRouteMetadata` | `{ altStack: DefinedTanStackServerRoute }`. |
| `AltStackFileRoute<TRoute, ...>` | Intersection of a TanStack route and `AltStackFileRouteMetadata`. |

`AltStackFileRouteOptions` and `CreateTanStackRouteHandlersOptions` are described above.

## Core re-exports

The package exposes only the following core subset. All names retain the behavior in [Server core API](./core.md).

| Group | Re-exported names |
| --- | --- |
| Initialization | `init`, `publicProcedure`, `default400ErrorSchema`, `default500ErrorSchema`, `InitOptions`, `InitResult` |
| Result values/types | `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `mapError`, `catchError`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`, `tryCatch`, `tryCatchAsync`, `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`, `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, `NarrowError` |
| Middleware | `createMiddleware`, `createMiddlewareWithErrors`, `middlewareMarker`, `middlewareOk`, `MiddlewareFunction`, `MiddlewareBuilder`, `MiddlewareResult`, `MiddlewareResultSuccess`, `MiddlewareFunctionWithErrors`, `MiddlewareBuilderWithErrors`, `MiddlewareBuilderWithErrorsStaged`, `AnyMiddlewareBuilderWithErrors`, `AnyMiddlewareFunctionWithErrors`, `Overwrite` |
| Procedures/context | `BaseProcedureBuilder`, `ProcedureBuilder`, `InputConfig`, `TypedContext`, `BaseContext`, `InferInput`, `Procedure`, `ReadyProcedure`, `PendingProcedure` |
| OpenAPI types only | `OpenAPISpec`, `GenerateOpenAPISpecOptions`, `OpenAPIPathItem`, `OpenAPIOperation`, `OpenAPIParameter`, `OpenAPIRequestBody`, `OpenAPIResponse` |
| Validation | `validateInput`, `parseSchema`, `mergeInputs`, `ParseResult`, `StructuredInput` |
| Telemetry helpers/types | `resolveTelemetryConfig`, `shouldIgnoreRoute`, `initTelemetry`, `createRequestSpan`, `endSpanWithError`, `setSpanOk`, `TelemetryConfig`, `TelemetryOption`, `ResolvedTelemetryConfig`, `Span` |
| Error tags | `extractTagsFromSchema`, `findHttpStatusForError` |

Notably, the public entrypoint does not re-export core `generateOpenAPISpec`, `withActiveSpan`, router classes/helpers, `RouterConfigValue`, or the additional core type utilities. Use `generateOpenAPISpecFromServerRoutes()` for attached routes or import deliberately from `@alt-stack/server-core`.

## Related

- [Server quickstart](../quickstart.md)
- [Server common patterns](../common-patterns.md)
- [Core API](./core.md)
