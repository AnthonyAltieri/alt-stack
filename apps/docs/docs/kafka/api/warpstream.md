# WarpStream Kafka client API Documentation

Package: `@alt-stack/kafka-client-warpstream`

This is a generated-schema Kafka producer with fixed WarpStream-oriented KafkaJS defaults. It is distinct from `@alt-stack/workers-warpstream`: this package publishes domain events to topics; the Workers package routes named job executions.

## `createWarpStreamClient`

```typescript
async function createWarpStreamClient<T extends TopicsMap>(
  options: WarpStreamClientOptions<T>,
): Promise<KafkaClient<T, Producer>>
```

```typescript
import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";
import { Topics } from "./generated-events.js";

const client = await createWarpStreamClient({
  bootstrapServer: "localhost:9092",
  clientId: "accounts-publisher",
  topics: Topics,
});

await client.send("user-events", { userId: "u_123", kind: "created" });
await client.disconnect();
```

### `WarpStreamClientOptions<T>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `bootstrapServer` | `string` | yes | the only broker placed in the KafkaJS `brokers` array |
| `topics` | `T extends TopicsMap` | yes | topic schemas for inference and runtime validation |
| `clientId` | `string` | no | defaults to `"warpstream-client"` |
| `producerConfig` | `Partial<ProducerConfig>` | no | spread over the adapter defaults |
| `onError` | `(error: Error) => void` | no | called before connection, validation, or send errors are thrown |

The KafkaJS connection timeout is fixed at 10,000 ms. Producer defaults are `metadataMaxAge: 60_000` and `allowAutoTopicCreation: false`; explicit `producerConfig` values override those producer defaults. Every send explicitly uses KafkaJS LZ4 compression.

The options do not currently expose KafkaJS `ssl`, `sasl`, a custom socket factory, or a prebuilt `Kafka` instance. If the endpoint requires those settings, use [the KafkaJS client](./kafkajs.md) and provide a fully configured KafkaJS instance.

### Send and error behavior

`send` and `sendBatch` validate through the supplied Zod schema, JSON-stringify records, and apply `SendOptions`. They throw `ValidationError`, `SendError`, or `ConnectionError` from `@alt-stack/kafka-client-core`. `producer` exposes the connected KafkaJS `Producer`; `disconnect()` delegates to it.

## Re-exports

The package re-exports `KafkaClient`, `TopicsMap`, `SendOptions`, `KafkaClientError`, `ValidationError`, `SendError`, and `ConnectionError`. See [Kafka client core](./client-core.md) for exact properties.
