# Quickstart

## Basic Consumer

```typescript
import { init, kafkaRouter, createConsumer } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
});

// Initialize procedure builder
const { procedure } = init();

// Define router with topics as keys
const router = kafkaRouter({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(({ input, ctx }) => {
      // input is typed: { userId: string, eventType: ..., timestamp: number }
      console.log(`Event: ${input.eventType} for user ${input.userId}`);
    }),
});

// Create and start consumer
const consumer = await createConsumer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});
```

## Basic Producer

```typescript
import { init, kafkaRouter, createProducer } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
});

const { procedure } = init();

// Define the same router for type-safe producing
const router = kafkaRouter({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(() => {}), // Handler not needed for producer
});

const producer = await createProducer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
});

// Type-safe: only valid topics and message shapes allowed
await producer.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});
```
