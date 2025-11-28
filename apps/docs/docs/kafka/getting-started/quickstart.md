# Quickstart

## Consumer

```typescript
import { init, kafkaRouter, createConsumer } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
});

const { procedure } = init();

const router = kafkaRouter({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(({ input, ctx }) => {
      console.log(`Event: ${input.eventType} for user ${input.userId}`);
    }),
});

const consumer = await createConsumer(router, {
  kafka: new Kafka({
    clientId: "my-consumer",
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});
```

## Producer (using Kafka Client)

For producers, use the Kafka client packages with AsyncAPI-generated types:

```typescript
// 1. Generate types: npx zod-asyncapi asyncapi.json -o ./generated-types.ts
import { Topics } from "./generated-types";
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";

const client = await createKafkaClient({
  kafka: { brokers: ["localhost:9092"], clientId: "my-producer" },
  topics: Topics,
});

// Type-safe sending
await client.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});
```

Or with WarpStream:

```typescript
import { Topics } from "./generated-types";
import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";

const client = await createWarpStreamClient({
  bootstrapServer: "my-cluster.warpstream.com:9092",
  topics: Topics,
});

await client.send("user-events", {
  userId: "user-123",
  eventType: "created",
  timestamp: Date.now(),
});
```
