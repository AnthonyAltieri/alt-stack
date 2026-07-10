# KafkaJS client API Documentation

Package: `@alt-stack/kafka-client-kafkajs`

This is the generated-schema producer binding for KafkaJS. It validates outgoing data against a runtime `Topics` map; it does not use a `KafkaRouter` and cannot consume records.

## `createKafkaClient`

```typescript
async function createKafkaClient<T extends TopicsMap>(
  options: KafkaJSClientOptions<T>,
): Promise<KafkaClient<T, Producer>>
```

The function obtains a KafkaJS producer, applies `producerConfig`, connects immediately, and returns a typed client. It accepts either an existing KafkaJS `Kafka` instance or a `KafkaConfig` object.

```typescript
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";
import { Topics } from "./generated-events.js";

const client = await createKafkaClient({
  kafka: {
    clientId: "billing-publisher",
    brokers: ["localhost:9092"],
  },
  topics: Topics,
});

await client.send("invoice-created", { invoiceId: "inv_123" });
await client.disconnect();
```

### `KafkaJSClientOptions<T>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `kafka` | `Kafka \| KafkaConfig` | yes | existing KafkaJS instance or constructor config |
| `topics` | `T extends TopicsMap` | yes | exact topic schemas used for types and runtime `safeParse` |
| `producerConfig` | `ProducerConfig` | no | forwarded to `kafka.producer(...)` |
| `onError` | `(error: Error) => void` | no | called before a connection, validation, or send error is thrown |

### Send behavior

`send` and `sendBatch` JSON-stringify payloads and forward `SendOptions` to KafkaJS records. Validation failures throw `ValidationError`; producer failures throw `SendError`. A failed initial connection throws `ConnectionError`. `producer` exposes the underlying KafkaJS `Producer`, and `disconnect()` delegates to it.

## Re-exports

The package re-exports the `KafkaClient`, `TopicsMap`, and `SendOptions` types plus `KafkaClientError`, `ValidationError`, `SendError`, and `ConnectionError`. Their exact shapes are in [Kafka client core](./client-core.md).
