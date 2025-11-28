# Consumers

Create Kafka consumers from routers.

## Basic Setup

```typescript
import { createConsumer, kafkaRouter, init } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";

const { procedure } = init();

const router = kafkaRouter({
  "user-events": procedure
    .input({ message: z.object({ userId: z.string() }) })
    .subscribe(({ input }) => {
      console.log(input.userId);
    }),
});

const consumer = await createConsumer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});

// Consumer is connected and running
```

## Kafka Config Options

Pass config directly instead of a Kafka instance:

```typescript
const consumer = await createConsumer(router, {
  kafka: {
    clientId: "my-app",
    brokers: ["localhost:9092"],
    ssl: true,
    sasl: {
      mechanism: "plain",
      username: "user",
      password: "pass",
    },
  },
  groupId: "my-consumer-group",
});
```

## Consumer Options

```typescript
const consumer = await createConsumer(router, {
  kafka: new Kafka({ brokers: ["localhost:9092"] }),
  groupId: "my-consumer-group",
  consumerConfig: {
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxBytesPerPartition: 1048576,
  },
  createContext: (baseCtx) => ({ logger: getLogger() }),
  onError: (error) => console.error("Consumer error:", error),
});
```

## Graceful Shutdown

```typescript
const consumer = await createConsumer(router, options);

process.on("SIGTERM", async () => {
  await consumer.disconnect();
  process.exit(0);
});
```
