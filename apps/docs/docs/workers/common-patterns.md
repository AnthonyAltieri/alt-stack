# Workers common patterns

## Treat the router as a job contract

A Worker router names executable work. Callers should know the job name and payload, but they should not need the handler implementation. Keep the router and Zod payloads in the worker service, generate AsyncAPI for cross-package clients, and use a server adapter to execute the handlers.

Kafka routers solve a different problem: they subscribe procedures to event topics. Do not use a Worker job as an event broadcast when multiple independent consumer groups need the same fact.

## Understand provider mappings

The core records three procedure types, but the adapters do not implement every piece of metadata equally:

| Core procedure | Trigger.dev adapter | WarpStream adapter |
| --- | --- | --- |
| `.task(handler)` | `schemaTask` when a payload schema exists, otherwise `task` | consumes a routed Kafka message |
| `.cron(schedule, handler)` | `schedules.task` using the cron `pattern` | no scheduler; still consumes a routed Kafka message |
| `.queue(name, handler)` | task/schemaTask; the queue name is not forwarded | consumes by job-name routing; the queue name is not used |

Trigger's current adapter ignores `CronConfig.timezone` and `.queue(name)` metadata. WarpStream's current adapter does not schedule cron procedures and subscribes to all procedures, including cron. Model only the behavior your selected adapter actually implements.

## Namespace jobs with routers

Nested worker routers use `.` between segments:

```typescript
const emailJobs = workerRouter({
  welcome: procedure.task(async () => ok()),
});

const jobs = workerRouter({
  email: emailJobs,
});

// Registered job name: "email.welcome"
```

`WorkerRouter.merge(prefix, router)` uses the same dot join. `mergeWorkerRouters` combines without a prefix and does not deduplicate job names. Provider lookup maps keep the last procedure for duplicate names, while some topic lists can still contain duplicates; make job names unique.

## Build application context once per execution

Use `init<AppContext>()` to type all handlers and pass `createContext` to the chosen server adapter:

```typescript
interface AppContext {
  db: Database;
}

const { procedure } = init<AppContext>();

const worker = await createWorker(jobs, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "jobs-v1",
  createContext: async (base) => ({
    db: await connectDatabase(),
  }),
});
```

Payload validation runs before `createContext`. Provider fields are merged after custom context fields, so reserved fields such as `jobId`, `jobName`, `attempt`, and `span` win on collisions.

Trigger context adds `trigger`. WarpStream context adds `topic`, `partition`, `offset`, and the raw KafkaJS `message`.

## Use ordinary middleware for runtime behavior

```typescript
const logged = procedure.use(async ({ ctx, next }) => {
  const started = Date.now();
  try {
    return await next();
  } finally {
    console.info(ctx.jobName, Date.now() - started);
  }
});
```

Middleware executes in order and may add context with `next({ ctx: overrides })`. The public `createMiddlewareWithErrors` surface records typed error schemas, but current adapters neither preserve its runtime flags through router registration nor unwrap Result middleware responses. Use ordinary `createMiddleware`/throwing middleware for operational code until that adapter path is implemented.

## Distinguish returned results from provider failures

Handlers are typed to return `Result`, and the packages re-export `ok`, `err`, and `TaggedError`. Current server adapters return that Result object directly and do not branch on `Ok` versus `Err`. Consequently:

- `ok(value)` is a normal successful provider result;
- `err(error)` is also currently a normal provider result, not a failed run; and
- throwing is the path that invokes `onError`, marks telemetry as failed, and lets the provider apply retry behavior.

`RetryableError` and `NonRetryableError` provide distinct codes, but the current adapters do not translate those classes into provider-specific retry settings. They pass thrown errors through.

### Current output-validation behavior

When `.output(schema)` is present, adapters parse the entire returned Result object with that schema. A schema for only `ok(value).value` therefore fails. Omit `.output()` on live jobs or describe the actual Result envelope until successful values are unwrapped by the runtime.

## Choose WarpStream routing once

### Topic per job

```typescript
const routing = { type: "topic-per-job", topicPrefix: "jobs." } as const;
```

The topic is the exact concatenation `${topicPrefix}${jobName}`—no delimiter is inserted. The record value is JSON for the payload. This is the default strategy with an empty prefix.

### Single queue

```typescript
const routing = { type: "single-queue", topic: "jobs" } as const;
```

Every record goes to the selected topic with JSON value `{ jobName, payload }`. Only the router-aware `createJobClient` supports this envelope. The generated-schema `workers-client-warpstream` client always uses topic-per-job.

Pass the identical routing object to `createWorker` and `createJobClient`. Provision every topic: the job client sets `allowAutoTopicCreation: false`.

## Pick the correct client

### Router-aware WarpStream client

`createJobClient(router, options)` validates against the live router and exposes `enqueue`. Use it inside the same codebase. It stamps `x-created-at`, which enables queue and end-to-end metrics in the WarpStream worker.

### Generated-schema clients

Generate AsyncAPI, run `zod-asyncapi`, and pass the generated runtime `Topics` object as `jobs`:

```typescript
const client = createTriggerClient({ jobs: Topics });
await client.trigger("send-welcome-email", payload);
```

AsyncAPI generation includes `.task` and `.queue` procedures and excludes `.cron` procedures. It describes logical job names, not provider topic prefixes or the single-queue envelope.

### Connect a separate service through a generated contract

The real-life workspace keeps handler code in a Worker application, writes its AsyncAPI contract, generates a small `workers-sdk` package, and lets an HTTP service import only that package plus a caller-side client:

```typescript title="worker service"
import { generateAsyncAPISpec } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./jobs.js";

const spec = generateAsyncAPISpec(jobRouter, {
  title: "Background jobs",
  version: "1.0.0",
});
```

```typescript title="calling service"
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "@acme/workers-sdk";

const jobs = await createWarpStreamClient({
  bootstrapServer: "localhost:9092",
  jobs: Topics,
});

await jobs.trigger("generate-report", {
  taskId: "task_123",
  userId: "user_123",
  completedAt: new Date().toISOString(),
});
```

This keeps the HTTP service independent of `WorkerRouter`, handler dependencies, and server startup. The generated WarpStream client is topic-per-job, so the Worker server must use the same empty/default prefix (or the client and server must share an explicit prefix).

`TriggerOptions` is a cross-provider surface, but support differs:

| Option | Trigger client | WarpStream generated client |
| --- | --- | --- |
| `idempotencyKey` | forwarded to Trigger.dev | Kafka record key |
| `delay` | forwarded to Trigger.dev | ignored |
| `maxRetries` | ignored | ignored |
| `metadata` | ignored | Kafka headers |

The WarpStream client's returned `id` is locally generated before the send; it is not a broker offset or a server-side run ID.

## Add tracing and metrics deliberately

Both server adapters support `telemetry: true` or a `WorkerTelemetryConfig`. Traces use `SpanKind.CONSUMER`, span name `job <jobName>`, attributes `job.name`, `job.id`, `job.attempt`, and final `job.status`.

Only the WarpStream server adapter exposes `metrics`. It records:

- `messaging.process.queue_time_ms` when the incoming record has a valid `x-created-at` epoch-millisecond header;
- `messaging.process.duration_ms`; and
- `messaging.process.e2e_time_ms` when creation time is available.

Install and configure `@opentelemetry/api` plus an SDK/exporter in the application. Altstack creates spans and instruments; it does not install an exporter.

## Shut down provider resources

Trigger's `createWorker` creates task definitions and has no disconnect method. The Trigger generated client also has no persistent connection, so `disconnect()` is a no-op.

WarpStream `createWorker`, `createJobClient`, and the generated client hold KafkaJS resources. Await their `disconnect()` methods during shutdown.

## See also

- [Workers core API](./api/core.md)
- [Trigger server adapter](./api/trigger.md)
- [WarpStream server adapter](./api/warpstream.md)
- [Worker client core](./api/client-core.md)
