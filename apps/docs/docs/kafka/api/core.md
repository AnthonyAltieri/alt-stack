# Kafka core API Documentation

Package: `@alt-stack/kafka-core`

`kafka-core` defines typed topic procedures and runs them with KafkaJS. It also creates router-derived producers and AsyncAPI 3.0 contracts. It is a server-side/event-processing package: applications that only publish against generated schemas should use a `kafka-client-*` binding.

## Primary workflow

```typescript
import { createConsumer, kafkaRouter, ok, publicProcedure } from "@alt-stack/kafka-core";
import { z } from "zod";

const router = kafkaRouter({
  events: publicProcedure
    .input({ message: z.object({ id: z.string() }) })
    .subscribe(({ input, ctx }) => {
      console.info(ctx.topic, input.id);
      return ok();
    }),
});

await createConsumer(router, {
  kafka: { clientId: "events", brokers: ["localhost:9092"] },
  groupId: "events-v1",
});
```

## Initialization and procedure builders

### `init<TCustomContext>(options?)`

Kafka `init` takes no options and returns `InitResult<TCustomContext>`:

| Member | Type and purpose |
| --- | --- |
| `router(config?)` | constructs `KafkaRouter<TCustomContext>` from prefixed routers; this is the legacy constructor form, not the object procedure form |
| `mergeRouters(...routers)` | calls `mergeKafkaRouters` |
| `procedure` | fresh `BaseKafkaProcedureBuilder` carrying the custom context type |

### `publicProcedure`

A standalone `BaseKafkaProcedureBuilder` with an empty custom-context type. Use `init<AppContext>().procedure` when handlers require application context.

The current object-based `kafkaRouter({...})` call cannot infer `TCustomContext` from its procedure values. A bare call therefore creates a router with empty custom context even when a procedure came from `init<AppContext>()`. To keep both custom context and the exact topic map, name the config and provide both generics:

```typescript
const { procedure } = init<AppContext>();
const eventProcedure = procedure
  .input({ message: z.object({ id: z.string() }) })
  .subscribe(({ input, ctx }) => {
    ctx.logger.info(input.id);
    return ok();
  });

const config = { events: eventProcedure };
const router = kafkaRouter<AppContext, typeof config>(config);
```

`typeof config` preserves the literal topic and its message schema. `createConsumer(router, { createContext: ... })` must then return `AppContext`. Supplying only `kafkaRouter<AppContext>(...)` uses the default config generic and widens the topic map.

### `InitResult<TCustomContext>`

The type of the object returned by `init`. Its `router` member accepts a map whose values are routers or arrays of routers; keys become prefixes.

### `BaseKafkaProcedureBuilder`

The immutable builder accumulates schemas and middleware. Each method returns a new builder.

`BaseKafkaProcedureBuilder.constructor` copies optional base input/output/error config, ordered middleware, an optional low-level router reference, middleware error schemas, and Result-middleware flags into one builder stage. Application code should obtain a correctly typed instance from `init().procedure`, `publicProcedure`, or `KafkaRouter.procedure`.

| Method | Effect |
| --- | --- |
| `.input({ message: schema })` | sets or replaces the Zod record-value schema and infers handler `input` |
| `.output(schema)` | records an output schema |
| `.errors(record)` | merges named Zod error schemas; later keys replace runtime schemas with the same key while the generic preserves their union |
| `.use(middlewareOrBuilder)` | appends one middleware function, a composed builder, or a result-based middleware builder and merges context override types |
| `.on(router)` | returns a builder carrying a router reference; current terminal methods still return procedure objects and do not auto-register them |
| `.subscribe(handler)` | returns `ReadyKafkaProcedure` for `kafkaRouter({ topic: procedure })` |
| `.handler(handler)` | returns `PendingKafkaProcedure`; `kafkaRouter` accepts it through the same object path |

Both terminal handlers receive `{ input, ctx }` and return `KafkaHandlerResult`, synchronously or asynchronously.

Current runtime caveats: consumer output validation parses the entire returned `Result`, not its successful value; and the consumer does not interpret Result envelopes from `createMiddlewareWithErrors`. See [common patterns](../common-patterns.md#current-output-validation-behavior) before using those two builder features in a live adapter.

## Routers

### `kafkaRouter(config)`

The recommended object constructor. Values may be ready/pending procedures or nested `KafkaRouter` instances. Procedure keys become literal topics; nested router keys are joined with `/`. The returned router carries a type-only `_topicTypes` mapping used by `createProducer`.

### `createKafkaRouter(config?)`

Creates an empty router or merges existing routers under the prefixes in `config`. Each value may be one router or an array. This form does not accept procedures directly.

### `mergeKafkaRouters(...routers)`

Copies all procedures into a new router in argument and registration order. It adds no prefix and performs no deduplication.

### `KafkaRouter<TCustomContext, TTopicMap>`

| Member | Behavior |
| --- | --- |
| `constructor(config?)` | same prefixed-router form as `createKafkaRouter` |
| `registerProcedure(topic, ready)` | converts a ready procedure to a registered `KafkaProcedure`; returns `this` |
| `registerPendingProcedure(topic, pending)` | converts a pending procedure to a registered procedure; returns `this` |
| `register(procedure)` | appends an already registered procedure; returns `this` |
| `merge(prefix, router)` | copies procedures and prefixes topics with `prefix/`; one trailing `/` is removed |
| `getProcedures()` | returns the router's mutable internal procedure array |
| `procedure` | returns a builder typed to this router; current terminal methods do not auto-register |
| `_topicTypes` | declaration-only property for topic/payload inference; it has no runtime value |

## Consumer

### `createConsumer(router, options)`

```typescript
async function createConsumer<TCustomContext>(
  router: KafkaRouter<TCustomContext>,
  options: CreateConsumerOptions<TCustomContext>,
): Promise<Consumer>
```

The function:

1. reuses `options.kafka` when it has a `consumer` method, otherwise constructs KafkaJS `Kafka` from the supplied `KafkaConfig`;
2. creates a consumer with `consumerConfig` plus the required `groupId`;
3. connects and subscribes once to all unique router topics with `fromBeginning: false`;
4. starts `consumer.run({ eachMessage })`; and
5. returns the connected KafkaJS `Consumer`.

For each record, procedures on that topic execute sequentially. Each gets separately validated input and separately created custom context. The base context fields are added after custom context and therefore take precedence over same-named custom fields.

### `CreateConsumerOptions<TCustomContext>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `kafka` | `Kafka \| KafkaConfig` | yes | KafkaJS instance or constructor config |
| `groupId` | `string` | yes | consumer group; always overrides any spread config value |
| `consumerConfig` | `Omit<ConsumerConfig, "groupId">` | no | forwarded to `kafka.consumer` |
| `createContext` | `(baseCtx) => TCustomContext \| Promise<TCustomContext>` | no | called once per procedure execution |
| `onError` | `(error: Error) => void` | no | called for an `eachMessage` failure before that failure is rethrown |

The callback is synchronous in the public type and is not awaited. Connection, subscribe, and `consumer.run` startup failures occur outside the `eachMessage` catch and do not call `onError`.

## Router-derived producer

### `createProducer(router, options)`

Connects a KafkaJS producer immediately and returns `TypedProducer` inferred from the router's `_topicTypes`. It accepts an existing KafkaJS instance or `KafkaConfig`.

### `CreateProducerOptions`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `kafka` | `Kafka \| KafkaConfig` | yes | KafkaJS instance or config |
| `producerConfig` | `ProducerConfig` | no | forwarded to `kafka.producer` |
| `onError` | `(error: Error) => void` | no | invoked for validation and send failures; not for the initial `connect()` failure |

### `TypedProducer<TTopicMap>`

| Member | Behavior |
| --- | --- |
| `send(topic, message, options?)` | validates against the router schema, JSON-stringifies, then sends one KafkaJS record |
| `sendBatch(topic, messages, options?)` | validates every payload, then sends one KafkaJS batch |
| `disconnect()` | delegates to the KafkaJS producer |
| `producer` | readonly underlying KafkaJS `Producer` |

Validation and producer failures are plain `Error` values in this package. The generated-schema clients use structured client error subclasses instead.

### `SendOptions`

`key?: string | Buffer | null`, `partition?: number`, `headers?: Record<string, string | Buffer>`, and `timestamp?: string`. Batch options apply to every record.

## AsyncAPI

### `generateAsyncAPISpec(router, options?)`

Returns an AsyncAPI 3.0 object with one channel, one message, and one `send` operation per registered procedure. Defaults are title `"Kafka API"` and version `"1.0.0"`.

`GenerateAsyncAPISpecOptions` has optional `title`, `version`, and `description` strings.

### AsyncAPI result shapes

- `AsyncAPISpec`: `asyncapi`, `info`, `channels`, optional `operations`, and optional `components` containing `schemas` and `messages`.
- `AsyncAPIChannel`: `address` plus a message-name to `$ref` map.
- `AsyncAPIOperation`: `action: "send" | "receive"`, a channel `$ref`, and message `$ref` array. This generator emits `"send"`.
- `AsyncAPIMessage`: `name`, `contentType`, and a payload `$ref` or inline schema. This generator emits `application/json`.
- `ExtractTopics<TRouter>`: type helper intended to extract registered topic literals.
- `ExtractMessageType<TRouter, TTopic>`: type helper intended to infer a selected topic's decoded payload.

Because `getProcedures()` exposes a widened array, router `_topicTypes` is the stronger topic map used by `createProducer`.

## Errors

### `KafkaError`

```typescript
new KafkaError(code: string, message: string, details?: unknown)
```

Readonly properties are `code` and `details`; `name` is `"KafkaError"`. `toJSON()` returns `{ error: { code, message, details? } }`. The method includes `details` only when it is truthy.

### `ValidationError`

`new ValidationError(message, details?)` extends `KafkaError` with code `VALIDATION_ERROR` and name `ValidationError`. The consumer uses it for record decoding/schema failures.

### `ProcessingError`

`new ProcessingError(message, details?)` extends `KafkaError` with code `PROCESSING_ERROR` and name `ProcessingError`. The consumer's internal configured-error function uses it, but ordinary thrown handler errors are passed through unchanged.

## Context and procedure types

### Input and inference

- `InputConfig`: `{ message?: z.ZodTypeAny }`.
- `InferInput<T>`: inferred schema output when `message` exists; otherwise `never`.
- `InferOutput<T>`: `z.infer<T>`.
- `InferErrorSchemas<T>`: maps each error-schema key to its inferred value.
- `ErrorUnion<T>`: union of all inferred error-schema values.
- `KafkaHandlerResult<TErrors, TOutput>`: `Result<inferred output | void, ResultError>`; the `TErrors` parameter participates in builder typing but the resulting error bound is `ResultError`.

### Context

`BaseKafkaContext` contains the raw KafkaJS `message`, `topic`, numeric `partition`, and string `offset`.

`TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>` intersects the base context, custom context, and `{ input: InferInput<TInput> }`. `TOutput` and `TErrors` preserve the builder signature but do not add declared fields.

### Procedure records

- `ProcedureConfig<TInput, TOutput, TErrors>` contains required `input` and optional `output`/`errors`.
- `KafkaProcedure` is a registered procedure with `topic`, config, handler, and middleware.
- `ReadyKafkaProcedure` has config, handler, middleware, and optional `middlewareWithErrorsFlags`; a router supplies its topic.
- `PendingKafkaProcedure` has the same shape as ready in the current implementation and is produced by `.handler()`.

`PendingKafkaProcedure.middleware` is the ordered `AnyMiddlewareFunction[]` captured by the builder; router registration copies it onto the registered procedure before consumer execution.

`PendingKafkaProcedure.config` contains the accumulated required message `input` config plus optional `output` and named `errors` schemas; the router copies this object without interpreting returned Result values.

## Middleware

### Throwing middleware

`createMiddleware<TContext>()` returns a factory. Calling that factory with a `MiddlewareFunction` creates a `MiddlewareBuilder`; `.pipe(...)` composes functions/builders in order. A function receives `ctx` and overloaded `next`, and may call `next({ ctx: overrides })` to merge fields for downstream middleware and the handler.

`MiddlewareFunction<TContext, TContextOverridesIn, TContextOverridesOut>` expresses that contract. `MiddlewareBuilder<TContext, TContextOverrides>` exposes `.pipe` and the internal `_middlewares` array. `Overwrite<TType, TWith>` models replacement of same-named context properties.

### Result-based middleware surface

`createMiddlewareWithErrors<TContext>().errors(schemas).fn(handler)` creates `MiddlewareBuilderWithErrors`. Its declared handler returns `Result<MiddlewareResultSuccess<...>, ResultError>`, and additional `.errors(...).fn(...)` calls replace its function while extending schemas.

| Result-middleware export | Contract |
| --- | --- |
| `MiddlewareFunctionWithErrors` | typed async function receiving overwritten context and Result-returning `next`; it resolves to a Result whose success carries `MiddlewareResultSuccess` |
| `MiddlewareBuilderWithErrorsStaged` | state returned by `.errors(...)`; exposes only `.fn(...)` so a handler must be installed before use |
| `AnyMiddlewareBuilderWithErrors` | type-erased alias used when procedure builders accept a Result-middleware builder at runtime |
| `AnyMiddlewareFunctionWithErrors` | type-erased function alias stored in the builder's `_fn` slot |

`middlewareOk(ctx)` creates the success Result expected by that contract. `middlewareMarker`, `MiddlewareResult`, and `MiddlewareResultSuccess` are exported plumbing shapes used to preserve context through `next()`.

| Public plumbing member | Runtime role |
| --- | --- |
| `MiddlewareBuilderWithErrors._errors` | accumulated Zod error-schema record; procedure `.use()` merges it into the procedure's declared middleware errors |
| `MiddlewareBuilderWithErrors._fn` | installed Result-returning middleware function, or `null` before `.fn(...)`; procedure `.use()` appends the non-null function |
| `MiddlewareResult.marker` | branded `middlewareMarker` value proving an ordinary middleware return came through `next()` |
| `MiddlewareResult.ok` | literal `true` discriminant on the ordinary middleware wrapper |
| `MiddlewareResult.data` | downstream context payload; it is typed as `unknown` on this exported runtime wrapper |
| `MiddlewareResultSuccess.marker` | the same branded marker inside the success value used by Result-based middleware |

The current Kafka consumer does not use `middlewareWithErrorsFlags` and does not unwrap Result-based middleware. Treat this as a public type surface that is not yet operational in the current adapter; ordinary `createMiddleware`/throwing middleware is the working runtime path.

## Result re-exports

For handler convenience, the package re-exports these values from `@alt-stack/result`:

- constructors/guards: `ok`, `err`, `isOk`, `isErr`;
- transformations/recovery: `map`, `flatMap`, `mapError`, `catchError`;
- extraction/matching: `unwrap`, `unwrapOr`, `unwrapOrElse`, `match`, `fold`;
- exception boundaries: `tryCatch`, `tryCatchAsync`;
- error utilities/classes: `isResultError`, `assertResultError`, `ResultAggregateError`, `TaggedError`.

It also re-exports the `Result`, `Ok`, `Err`, `ResultError`, `InferErrorTag`, `InferErrorTags`, and `NarrowError` types. See the [Result documentation](../../result/quickstart.md) for their behavior.
