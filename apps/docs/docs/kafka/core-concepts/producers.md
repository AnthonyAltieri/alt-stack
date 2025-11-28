# Producers

Create type-safe Kafka producers from routers.

## Basic Setup

```typescript
import { createProducer, kafkaRouter, init } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

const { procedure } = init();

const router = kafkaRouter({
  "user-events": procedure
    .input({
      message: z.object({
        userId: z.string(),
        eventType: z.enum(["created", "updated", "deleted"]),
        timestamp: z.number(),
      }),
    })
    .subscribe(() => {}), // Handler not needed for producer
});

const producer = await createProducer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
});
```

## Type-Safe Sending

```typescript
// TypeScript enforces valid topics and message shapes
await producer.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});

// Type error: "invalid-topic" doesn't exist
await producer.send("invalid-topic", { data: "test" });

// Type error: missing required field
await producer.send("user-events", { userId: "123" });
```

## Batch Sending

```typescript
await producer.sendBatch("user-events", [
  { userId: "user-1", eventType: "created", timestamp: Date.now() },
  { userId: "user-2", eventType: "created", timestamp: Date.now() },
  { userId: "user-1", eventType: "updated", timestamp: Date.now() },
]);
```

## Send Options

```typescript
await producer.send(
  "user-events",
  { userId: "123", eventType: "created", timestamp: Date.now() },
  {
    key: "user-123",           // Message key for partitioning
    partition: 0,              // Explicit partition
    headers: { source: "api" }, // Custom headers
    timestamp: Date.now().toString(),
  }
);
```

## Producer Options

```typescript
const producer = await createProducer(router, {
  kafka: new Kafka({ brokers: ["localhost:9092"] }),
  producerConfig: {
    allowAutoTopicCreation: false,
    transactionTimeout: 30000,
  },
  onError: (error) => {
    console.error("Producer error:", error);
  },
});
```

## Disconnecting

```typescript
await producer.disconnect();
```

## Accessing Raw Producer

```typescript
// Access the underlying kafkajs Producer if needed
const rawProducer = producer.producer;
```
