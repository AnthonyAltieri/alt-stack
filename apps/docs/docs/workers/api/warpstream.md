# WarpStream server adapter API Documentation

Package: `@alt-stack/workers-warpstream`

This package provides two router-aware boundaries:

- `createWorker` starts a KafkaJS consumer and executes procedures; and
- `createJobClient` connects a producer and enqueues jobs using the same live router.

It also re-exports every `@alt-stack/workers-core` export.

## `createWorker`

```typescript
async function createWorker<TCustomContext extends object>(
  router: WorkerRouter<TCustomContext>,
  options: CreateWorkerOptions<TCustomContext>,
): Promise<WorkerResult>
```

The function initializes enabled telemetry/metrics, connects a KafkaJS consumer, subscribes with `fromBeginning: false`, starts `consumer.run({ eachMessage })`, and returns a disconnect handle.

### `CreateWorkerOptions<TCustomContext>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `kafka` | `Kafka \| KafkaConfig` | yes | existing KafkaJS instance or config |
| `groupId` | `string` | yes | consumer group; overrides consumer config |
| `routing` | `RoutingStrategy` | no | defaults to topic-per-job with empty prefix |
| `consumerConfig` | `Omit<ConsumerConfig, "groupId">` | no | forwarded to `kafka.consumer` |
| `createContext` | `(baseCtx: WarpStreamContext) => TCustomContext \| Promise<TCustomContext>` | no | called after payload validation |
| `onError` | `(error: Error, ctx: WarpStreamContext) => void \| Promise<void>` | no | awaited for failures after a context has been constructed |
| `telemetry` | `WorkerTelemetryOption` | no | core tracing configuration |
| `metrics` | `WorkerMetricsOption` | no | queue/processing/end-to-end histogram configuration |

When a `KafkaConfig` is supplied, the adapter preserves it and defaults `connectionTimeout` to 10,000 ms. An existing `Kafka` instance is used unchanged.

### Execution behavior

The job ID is `${topic}-${partition}-${offset}` and `attempt` is always `1`; Kafka retry attempts are not counted. The adapter extracts the route and JSON payload, optionally records queue time, creates a span/context, looks up the procedure, validates input, creates custom context, runs middleware and the handler, and records success/failure.

A returned Altstack `Err` is treated as a successful handler return. Throw to reach `onError`, error telemetry, and KafkaJS failure handling. Output schemas currently parse the full Result envelope. Result-based middleware is not unwrapped.

Malformed JSON or a malformed single-queue envelope can fail during route extraction before `WarpStreamContext` exists; that path rethrows without calling `onError` or creating a span.

### `WorkerResult`

```typescript
interface WorkerResult {
  disconnect: () => Promise<void>;
}
```

`disconnect` delegates to the KafkaJS consumer.

## Routing

### `RoutingStrategy`

```typescript
type RoutingStrategy =
  | { type: "topic-per-job"; topicPrefix?: string }
  | { type: "single-queue"; topic: string };
```

- Topic per job subscribes to `${topicPrefix ?? ""}${jobName}` for every registered procedure. Values are JSON payloads. The prefix is concatenated with no automatic separator.
- Single queue subscribes once to `topic`. Values must be JSON `{ jobName, payload }` envelopes.

All core procedure types are included in subscriptions. `.cron()` is not scheduled by this adapter, and `.queue(queueName)` does not affect routing.

### `WarpStreamContext`

Extends `BaseWorkerContext` with `topic`, numeric `partition`, string `offset`, and raw KafkaJS `message`.

## `createJobClient`

```typescript
async function createJobClient<TRouter extends WorkerRouter<object>>(
  router: TRouter,
  options: CreateJobClientOptions,
): Promise<JobClient<TRouter>>
```

The function connects a KafkaJS producer, indexes the router's procedures, and returns a router-inferred client. It is the only client that supports both routing strategies.

### `CreateJobClientOptions`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `kafka` | `Kafka \| KafkaConfig` | yes | existing KafkaJS instance or complete config |
| `routing` | `RoutingStrategy` | no | must exactly match the worker; default topic-per-job |
| `producerConfig` | `ProducerConfig` | no | overrides adapter defaults |
| `clientId` | `string` | no | used only when constructing Kafka; default config ID or `warpstream-job-client` |
| `onError` | `(error: Error) => void` | no | called before connection, unknown-job, validation, or send errors are thrown |

When constructing Kafka, connection timeout defaults to 10,000 ms. Producer defaults are `metadataMaxAge: 60_000` and `allowAutoTopicCreation: false`; supplied config overrides them. Sends force LZ4 compression.

### `JobClient<TRouter>`

| Member | Behavior |
| --- | --- |
| `enqueue(jobName, payload, options?)` | verifies the job exists, validates payload, builds the selected route, stamps `x-created-at`, and sends one message |
| `disconnect()` | disconnects the KafkaJS producer |

The public interface intentionally does not expose the producer.

### `EnqueueOptions`

`key?: string` becomes the Kafka record key. `headers?: Record<string, string>` becomes Kafka headers, but the adapter's `x-created-at` epoch-millisecond value overwrites a caller header with that name.

### Inference helpers

- `InferJobNames<TRouter>` attempts to derive the job-name union from `getProcedures()`.
- `InferJobPayload<TRouter, TJobName>` attempts to derive the selected Zod payload output.

Because `WorkerRouter.getProcedures()` currently returns a widened array, inference can be broader than the literal object passed to `workerRouter`; validate the actual editor type before relying on these helpers across package boundaries.

## Re-exports and complete surface

Adapter-specific exports are `createWorker`, `createJobClient`, `WarpStreamContext`, `CreateWorkerOptions`, `CreateJobClientOptions`, `WorkerResult`, `RoutingStrategy`, `JobClient`, `EnqueueOptions`, `InferJobNames`, and `InferJobPayload`. Every [Workers core API](./core.md) export is also re-exported.
