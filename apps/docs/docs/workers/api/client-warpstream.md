# WarpStream generated worker client API Documentation

Package: `@alt-stack/workers-client-warpstream`

This caller-side client validates jobs through a generated Zod map and publishes one Kafka topic per job. It is separate from the router-aware `createJobClient` in `@alt-stack/workers-warpstream`.

## `createWarpStreamClient`

```typescript
async function createWarpStreamClient<T extends JobsMap>(
  options: WarpStreamClientOptions<T>,
): Promise<WorkerClient<T>>
```

The function creates and connects a KafkaJS producer before returning.

```typescript
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "./generated-jobs.js";

const client = await createWarpStreamClient({
  bootstrapServer: "localhost:9092",
  clientId: "api-job-client",
  topicPrefix: "jobs.",
  jobs: Topics,
});

await client.trigger("send-welcome-email", payload);
await client.disconnect();
```

### `WarpStreamClientOptions<T>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `bootstrapServer` | `string` | yes | sole KafkaJS broker |
| `jobs` | `T extends JobsMap` | yes | runtime Zod job schemas |
| `topicPrefix` | `string` | no | directly prepended to each job name; default `""` |
| `clientId` | `string` | no | defaults to `"warpstream-worker-client"` |
| `producerConfig` | `Partial<ProducerConfig>` | no | overrides producer defaults |
| `onError` | `(error: Error) => void` | no | called before connection, validation, or trigger errors are thrown |

Connection timeout is 10,000 ms. Producer defaults are `metadataMaxAge: 60_000` and `allowAutoTopicCreation: false`; explicit producer config overrides them. Sends force LZ4 compression.

The options do not expose KafkaJS TLS/SASL settings or a prebuilt Kafka instance. Use the router-aware WarpStream job client when you need a full `KafkaConfig`, or add those capabilities before using this binding with an authenticated endpoint.

### Routing and messages

The topic is `${topicPrefix}${jobName}` with no inserted separator. Values are JSON payloads. Headers contain caller `metadata` plus `x-created-at`, with the adapter timestamp taking precedence. `idempotencyKey` becomes the Kafka record key. `delay` and `maxRetries` are ignored.

The client supports topic-per-job only. It cannot emit the `{ jobName, payload }` envelope required by the server adapter's `single-queue` strategy.

`triggerBatch` sends one KafkaJS batch after validating every payload. It uses one creation timestamp and the same Kafka key/metadata for all messages. Returned IDs are generated locally and do not identify Kafka offsets or worker runs.

Failures are `ValidationError`, `TriggerError`, or `ConnectionError`; `disconnect()` closes the KafkaJS producer.

## Re-exports

The package re-exports `WorkerClient`, `JobsMap`, `TriggerOptions`, `TriggerResult`, `WorkerClientError`, `ValidationError`, `TriggerError`, and `ConnectionError`. See [worker client core](./client-core.md).
