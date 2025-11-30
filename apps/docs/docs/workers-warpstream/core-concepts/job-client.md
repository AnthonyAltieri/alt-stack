# Job Client

Type-safe producer for enqueuing jobs.

## Basic Usage

```typescript
import { createJobClient } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./jobs";

const client = await createJobClient(jobRouter, {
  kafka: { brokers: ["warpstream.example.com:9092"] },
});

// Fully typed - invalid job names or payloads are compile errors
await client.enqueue("send-email", {
  to: "user@example.com",
  subject: "Hello",
  body: "World",
});

await client.disconnect();
```

## Options

```typescript
const client = await createJobClient(router, {
  // Kafka connection
  kafka: { brokers: ["localhost:9092"] },
  
  // Or pass an existing Kafka instance
  kafka: existingKafkaInstance,
  
  // Routing strategy (must match consumer)
  routing: { type: "topic-per-job" },
  
  // Client ID
  clientId: "my-producer",
  
  // Error callback
  onError: (error) => console.error(error),
});
```

## Partition Keys

Route related jobs to the same partition:

```typescript
await client.enqueue(
  "process-order",
  { orderId: "123", items: [...] },
  { key: "user-456" }  // All jobs for this user go to same partition
);
```

## Custom Headers

```typescript
await client.enqueue(
  "send-notification",
  { userId: "123", message: "Hello" },
  { headers: { "x-priority": "high", "x-source": "api" } }
);
```


