# Producers

Create type-safe Kafka producers using AsyncAPI-generated types.

## Installation

```bash
# Core + KafkaJS binding
pnpm add @alt-stack/kafka-client-core @alt-stack/kafka-client-kafkajs kafkajs zod

# Or for WarpStream
pnpm add @alt-stack/kafka-client-core @alt-stack/kafka-client-warpstream kafkajs zod
```

## Basic Setup

Use types generated from your AsyncAPI spec with `zod-asyncapi`:

```typescript
// 1. Generate types from AsyncAPI spec
// npx zod-asyncapi asyncapi.json -o ./generated-types.ts

// 2. Import generated types
import { Topics } from "./generated-types";
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";

// 3. Create type-safe client
const client = await createKafkaClient({
  kafka: { brokers: ["localhost:9092"], clientId: "my-producer" },
  topics: Topics,
});

// 4. Send messages with full type safety
await client.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});
```

## KafkaJS Client

```typescript
import { Topics } from "./generated-types";
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";

const client = await createKafkaClient({
  kafka: {
    brokers: ["localhost:9092"],
    clientId: "my-app",
    ssl: true,
    sasl: { mechanism: "plain", username: "user", password: "pass" },
  },
  topics: Topics,
  producerConfig: {
    allowAutoTopicCreation: false,
  },
  onError: (error) => console.error("Producer error:", error),
});
```

## WarpStream Client

Optimized for WarpStream with recommended defaults (LZ4 compression, extended timeouts):

```typescript
import { Topics } from "./generated-types";
import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";

const client = await createWarpStreamClient({
  bootstrapServer: "my-cluster.warpstream.com:9092",
  topics: Topics,
  clientId: "my-producer",
});
```

## Type-Safe Sending

```typescript
// TypeScript enforces valid topics and message shapes
await client.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});

// Type error: "invalid-topic" doesn't exist
await client.send("invalid-topic", { data: "test" });

// Type error: missing required field
await client.send("user-events", { userId: "123" });
```

## Batch Sending

```typescript
await client.sendBatch("user-events", [
  { userId: "user-1", eventType: "created", timestamp: Date.now() },
  { userId: "user-2", eventType: "created", timestamp: Date.now() },
  { userId: "user-1", eventType: "updated", timestamp: Date.now() },
]);
```

## Send Options

```typescript
await client.send(
  "user-events",
  { userId: "123", eventType: "created", timestamp: Date.now() },
  {
    key: "user-123",              // Message key for partitioning
    partition: 0,                 // Explicit partition
    headers: { source: "api" },   // Custom headers
    timestamp: Date.now().toString(),
  }
);
```

## Disconnecting

```typescript
await client.disconnect();
```

## Accessing Raw Producer

For advanced use cases (transactions, producer events, etc.), access the underlying KafkaJS producer:

```typescript
// Access the raw kafkajs Producer
const rawProducer = client.producer;

// Use kafkajs features directly
await rawProducer.send({
  topic: "my-topic",
  messages: [{ value: "raw message" }],
  acks: -1,
  timeout: 30000,
});
```

## Error Handling

```typescript
import { ValidationError, SendError, ConnectionError } from "@alt-stack/kafka-client-kafkajs";

try {
  await client.send("user-events", invalidData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Invalid message:", error.topic, error.details);
  } else if (error instanceof SendError) {
    console.error("Failed to send:", error.topic, error.cause);
  } else if (error instanceof ConnectionError) {
    console.error("Connection failed:", error.cause);
  }
}
```
