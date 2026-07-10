# Workers core API Documentation

Package: `@alt-stack/workers-core`

`workers-core` defines provider-neutral job contracts. It contains routers, procedure builders, middleware, validation, AsyncAPI generation, and OpenTelemetry helpers. It does not register Trigger.dev tasks or connect to Kafka; select a server adapter for execution.

## Initialization and builders

### `init<TCustomContext>(options?)`

Returns `InitResult<TCustomContext>`:

| Member | Purpose |
| --- | --- |
| `router(config)` | creates a `WorkerRouter` from ready procedures or nested routers |
| `mergeRouters(...routers)` | calls `mergeWorkerRouters` |
| `procedure` | fresh `BaseWorkerProcedureBuilder` carrying the custom context type |

`InitOptions<TCustomContext>` is currently an empty extension-point interface. Passing it has no runtime effect.

### `publicProcedure`

A standalone procedure builder with empty custom context. Prefer `init<AppContext>().procedure` when handlers use application services.

### `InitResult<TCustomContext>`

The public type of the object returned by `init`, with the three members above.

### `BaseWorkerProcedureBuilder`

The immutable builder exposes:

`BaseWorkerProcedureBuilder.constructor` copies optional base input/output/error config, ordered middleware, an optional low-level router reference, middleware error schemas, and Result-middleware flags into a new builder stage. Prefer `init().procedure`, `publicProcedure`, or `WorkerRouter.procedure` instead of constructing it manually.

| Method | Effect |
| --- | --- |
| `.input({ payload: schema })` | sets/replaces the Zod payload schema and infers handler input |
| `.output(schema)` | records a Zod output schema |
| `.errors(record)` | merges named Zod error schemas |
| `.use(middlewareOrBuilder)` | appends ordinary, composed, or result-based middleware and merges context override types |
| `.task(handler)` | returns a ready procedure with `type: "task"` |
| `.cron(schedule, handler)` | returns a ready procedure with `type: "cron"`; string schedules become `{ pattern }` |
| `.queue(queueName, handler)` | returns a ready procedure with `type: "queue"` and records `queueName` |
| `.handler(handler)` | returns a pending procedure without job type/name |

Handlers receive `{ input, ctx }` and return `WorkerHandlerResult`, directly or through a promise.

Provider adapters currently parse the whole Result with an output schema and do not branch on returned `Err` values. They also do not unwrap result-based middleware. The builder records those contracts, but use [the documented runtime paths](../common-patterns.md#distinguish-returned-results-from-provider-failures) when executing jobs today.

## Routers

### `workerRouter(config)`

The recommended object constructor. Keys become job names. Values are ready procedures or nested `WorkerRouter` instances. Nesting joins names with `.`.

### `createWorkerRouter(config?)`

Creates an empty router, optionally merging existing routers under prefixes. Each config value can be a router or router array; it does not accept procedure values.

### `mergeWorkerRouters(...routers)`

Copies every registered procedure into a new router in order, without a prefix or deduplication.

### `WorkerRouter<TCustomContext>`

| Member | Behavior |
| --- | --- |
| `constructor(config?)` | optional prefixed-router/array configuration |
| `registerProcedure(jobName, ready)` | creates and appends a registered procedure; returns `this` |
| `registerPendingProcedure(jobName, type, pending, options?)` | registers a pending handler with explicit type and optional `{ cron, queue }` strings |
| `register(procedure)` | appends a fully registered procedure; returns `this` |
| `merge(prefix, router)` | copies procedures, using `${prefix}.${jobName}` when prefix is truthy |
| `getProcedures()` | returns the mutable internal procedure array |
| `procedure` | returns a builder carrying this router's context type; terminal calls do not auto-register |

`registerPendingProcedure` turns `options.cron` into `{ pattern }`; it cannot specify a timezone through that method.

## Procedure and context types

### Input/output/error inference

- `InputConfig`: `{ payload?: z.ZodTypeAny }`.
- `InferInput<T>`: schema output when `payload` exists; otherwise `undefined`.
- `InferOutput<T>`: `z.infer<T>`.
- `InferErrorSchemas<T>`: error-key to inferred-schema map.
- `ErrorUnion<T>`: union of the inferred schema values.
- `WorkerHandlerResult<TErrors, TOutput>`: `Result<inferred output | void, ResultError>`. The `TErrors` generic is carried by builders, while the final bound is the general `ResultError`.

### `BaseWorkerContext`

| Property | Type | Meaning |
| --- | --- | --- |
| `jobId` | `string` | provider execution identifier |
| `jobName` | `string` | registered router name |
| `attempt` | `number` | current attempt; Trigger derives it, WarpStream currently fixes it at 1 |
| `span` | OpenTelemetry `Span` or `undefined` | core-created span when enabled and available |

`TypedWorkerContext<TInput, TOutput, TErrors, TCustomContext>` intersects this base, custom context, and `{ input }`. `TOutput`/`TErrors` preserve the signature but add no declared context properties.

### `CronConfig`

`pattern: string` plus optional `timezone: string`. Provider support differs: the current Trigger adapter forwards only the pattern, and WarpStream does not schedule cron jobs.

### Procedure records

- `WorkerProcedure` is registered and contains `jobName`, `type`, optional `cron`/`queue`, config, handler, middleware, and optional `middlewareWithErrorsFlags`.
- `ReadyWorkerProcedure` lacks `jobName`; it is produced by `.task`, `.cron`, or `.queue` for router registration.
- `PendingWorkerProcedure` lacks job name and type; it is produced by `.handler` for explicit `registerPendingProcedure` use.

The shared config has required `input` and optional `output` and `errors` schema records.

`ReadyWorkerProcedure.middleware` and `PendingWorkerProcedure.middleware` are ordered `AnyMiddlewareFunction[]` arrays captured by the builder. Router registration copies the appropriate array onto the registered `WorkerProcedure` before an adapter runs it.

`ReadyWorkerProcedure.config` and `PendingWorkerProcedure.config` both hold the required payload `input` config plus optional `output` and named `errors` schemas. The ready shape additionally chooses task/cron/queue execution; the pending shape leaves that choice to explicit router registration.

## Validation

### `parseSchema(schema, value)`

Calls synchronous Zod `safeParse` and returns `ParseResult<T>`:

```typescript
interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: z.ZodError;
}
```

### `validateInput(inputConfig, payload)`

Returns the payload unchanged when no schema exists. Otherwise it parses the schema and resolves with the parsed/transformed value. Failure throws `ValidationError("Payload validation failed", details)`; `details` is `{ errors: Array<{ path: string; message: string }> }`, with Zod path segments joined by `.`.

Although the function returns a promise, its current Zod parse is synchronous and does not use `safeParseAsync`.

## AsyncAPI

### `generateAsyncAPISpec(router, options?)`

Generates AsyncAPI 3.0 for registered `task` and `queue` procedures. Cron procedures are excluded. Each logical job becomes a channel whose `address` is the exact job name and an operation with `action: "send"`.

Defaults are title `"Workers API"` and version `"1.0.0"`. `GenerateAsyncAPISpecOptions` provides optional `title`, `version`, and `description`.

Zod payloads become OpenAPI-3-targeted JSON Schema components. Equivalent serialized schemas are deduplicated. Conversion failure logs a warning and substitutes `{ type: "object" }`.

### AsyncAPI shapes

- `AsyncAPISpec`: `asyncapi`, `info`, `channels`, optional `operations`, and optional `components.schemas/messages`.
- `AsyncAPIChannel`: `address` and named message `$ref` map.
- `AsyncAPIOperation`: `action`, channel `$ref`, and message `$ref` array.
- `AsyncAPIMessage`: `name`, `contentType`, and payload `$ref` or inline schema.
- `ExtractJobNames<TRouter>`: helper intended to extract task/queue job names.
- `ExtractPayloadType<TRouter, TJobName>`: helper intended to infer one job payload.

`WorkerRouter.getProcedures()` is publicly widened, so these extraction helpers may be broader than the literal config in practice. Generated Zod maps remain the reliable cross-package contract.

## Errors

All classes extend `Error`, expose readonly fields, and set `name` to the subclass name.

### `WorkerError`

```typescript
new WorkerError(
  message: string,
  code: string = "WORKER_ERROR",
  details?: unknown,
)
```

`toJSON()` always returns `{ error: { code, message, details } }`; the `details` key is present even when its value is `undefined`.

### `ValidationError`

`new ValidationError(message, details?)` has code `VALIDATION_ERROR`.

### `ProcessingError`

`new ProcessingError(message, details?)` has code `PROCESSING_ERROR`. Adapters use it for unknown jobs and their internal configured-error conversion path.

### `RetryableError`

`new RetryableError(message, retryAfter?, details?)` has code `RETRYABLE_ERROR` and readonly `retryAfter?: number`. Current adapters do not translate `retryAfter` into provider configuration.

### `NonRetryableError`

`new NonRetryableError(message, details?)` has code `NON_RETRYABLE_ERROR`. Current adapters do not special-case it; a thrown instance is rethrown to the provider like other errors.

## Middleware

### Ordinary middleware

`createMiddleware<TContext>()` returns a factory for a `MiddlewareFunction`. The function receives `ctx` and an overloaded `next`; `next({ ctx: override })` merges downstream context. The resulting `MiddlewareBuilder` has `.pipe(...)` for ordered composition.

Public supporting types are:

- `MiddlewareFunction<TContext, TContextOverridesIn, TContextOverridesOut>`;
- `MiddlewareBuilder<TContext, TContextOverrides>`;
- `AnyMiddlewareFunction` and `AnyMiddlewareBuilder`, type-erased aliases; and
- `Overwrite<TType, TWith>`, which models replacement of same-key properties.

The index exports `AnyMiddlewareFunction` and `AnyMiddlewareBuilder` in addition to the more specific types.

`MiddlewareBuilder._middlewares` is the public runtime array used by `.pipe(...)` and procedure `.use(...)`; it preserves middleware execution order while its generic parameters carry accumulated context overrides.

### Result-based middleware surface

`createMiddlewareWithErrors<TContext>().errors(schemas).fn(handler)` builds declared Result-returning middleware. Its public types are `MiddlewareFunctionWithErrors`, `MiddlewareBuilderWithErrors`, `MiddlewareBuilderWithErrorsStaged`, `AnyMiddlewareFunctionWithErrors`, and `AnyMiddlewareBuilderWithErrors`.

`middlewareOk(ctx)` returns the typed successful Result. `middlewareMarker`, `MiddlewareResult`, and `MiddlewareResultSuccess` are the exported chain plumbing. Current adapters do not preserve/use the error flags or unwrap these Result envelopes, so this type surface is not the operational middleware path yet.

| Public plumbing member | Runtime role |
| --- | --- |
| `MiddlewareBuilderWithErrors._errors` | accumulated Zod error-schema record merged into a procedure by `.use(...)` |
| `MiddlewareBuilderWithErrors._fn` | installed Result-returning middleware function, or `null` before `.fn(...)` |
| `MiddlewareResult.marker` | branded `middlewareMarker` value proving an ordinary middleware return came through `next()` |
| `MiddlewareResult.ok` | literal `true` discriminant on the ordinary middleware wrapper |
| `MiddlewareResult.data` | downstream context payload, exposed as `unknown` on the runtime wrapper |
| `MiddlewareResultSuccess.marker` | the same branded marker inside the context-carrying success value for Result-based middleware |

## Telemetry

`Span` and `SpanStatusCode` are type re-exports from `@opentelemetry/api`. The peer is optional at runtime; initialization resolves `false` and instrumentation becomes a no-op when it cannot be imported.

### Configuration

`WorkerTelemetryConfig`:

| Property | Type | Default |
| --- | --- | --- |
| `enabled` | `boolean` | required |
| `serviceName` | `string` | `altstack-worker` |
| `ignoreJobs` | `string[]` | `[]` |

`WorkerTelemetryOption` is `boolean | WorkerTelemetryConfig`. `ResolvedWorkerTelemetryConfig` has required normalized `enabled`, `serviceName`, and `ignoreJobs`.

### Functions

| Export | Behavior |
| --- | --- |
| `resolveWorkerTelemetryConfig(option)` | normalizes undefined/false, true, or the object form |
| `shouldIgnoreJob(jobName, config)` | exact `ignoreJobs.includes(jobName)` check |
| `initWorkerTelemetry()` | lazy-imports the API and resolves whether it is available |
| `createJobSpan(jobName, jobId, attempt, config)` | creates a `SpanKind.CONSUMER` span named `job <name>` if the API was initialized |
| `endSpanWithError(span, error)` | sets ERROR and records the exception; it does not call `span.end()` |
| `setSpanOk(span)` | sets OpenTelemetry OK status |
| `setJobStatus(span, status)` | sets `job.status` to `success`, `error`, or `retry` |

`createJobSpan` also sets `job.name`, `job.id`, and `job.attempt`. Callers/adapters own ending the span.

## Metrics

### `JOB_CREATED_AT_HEADER`

The constant string `"x-created-at"`. WarpStream clients stamp epoch milliseconds in this header so the worker can calculate queue and end-to-end time.

### Configuration

`WorkerMetricsConfig` has required `enabled` and optional `serviceName`, `ignoreJobs`, and `histogramBuckets` (milliseconds). `WorkerMetricsOption` is the boolean-or-object union. `ResolvedWorkerMetricsConfig` makes every field required.

Default buckets are `10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000` ms.

### Functions

| Export | Behavior |
| --- | --- |
| `resolveWorkerMetricsConfig(option)` | supplies defaults for boolean/undefined/object forms |
| `shouldIgnoreJobMetrics(jobName, config)` | exact ignore-list membership |
| `initWorkerMetrics(config)` | initializes three histograms once; resolves `false` if the API/metrics surface is unavailable |
| `recordQueueTime(jobName, ms)` | records `messaging.process.queue_time_ms` with `job.name` |
| `recordProcessingTime(jobName, ms, status)` | records `messaging.process.duration_ms` with name/status |
| `recordE2ETime(jobName, ms, status)` | records `messaging.process.e2e_time_ms` with name/status |
| `calculateQueueTime(header)` | parses epoch milliseconds and returns age or `null` |

`calculateQueueTime` rejects missing, non-numeric, non-positive, future, or older-than-seven-days timestamps. Histogram recording functions are no-ops before successful initialization.

## Result re-exports

The package re-exports from `@alt-stack/result`:

- `ok`, `err`, `isOk`, `isErr`;
- `map`, `flatMap`, `mapError`, `catchError`;
- `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`;
- `tryCatch`, `tryCatchAsync`;
- `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`; and
- types `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, `NarrowError`.

See the [Result quickstart](../../result/quickstart.md) for exact Result behavior.
