# Quickstart

Get started with a simple example that demonstrates the core concepts.

## Basic Example

```typescript
import { createKafkaRouter, createConsumer } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

// Define message schema
const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
});

// Create router
const router = createKafkaRouter()
  .topic("user-events", {
    input: {
      message: UserEventSchema,
    },
  })
  .handler((ctx) => {
    // ctx.input is typed based on UserEventSchema
    console.log(`Processing ${ctx.input.eventType} for user ${ctx.input.userId}`);
  });

// Create consumer (automatically starts consuming messages)
const consumer = await createConsumer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});

// Consumer is now running and processing messages automatically
// Messages are validated and routed to the appropriate handlers
```

This example shows:
- Type-safe topic definitions with Zod schemas
- Automatic message validation
- Type inference in handlers
- Simple consumer setup

