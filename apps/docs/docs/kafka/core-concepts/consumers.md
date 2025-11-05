# Consumers

Create and configure Kafka consumers to process messages from your routers.

## Basic Consumer Setup

Use `createConsumer` to create a Kafka consumer from a router:

```typescript
import { createConsumer, createKafkaRouter } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";

const router = createKafkaRouter()
  .topic("user-events", {
    input: {
      message: z.object({
        userId: z.string(),
      }),
    },
  })
  .handler((ctx) => {
    console.log(ctx.input.message.userId);
  });

const consumer = await createConsumer(router, {
  kafka: new Kafka({
    clientId: "my-app",
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});

// Consumer is automatically connected and started
// Messages are automatically validated and routed to handlers
```

## Kafka Configuration

Pass Kafka configuration directly:

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

## Consumer Configuration

Customize consumer behavior:

```typescript
const consumer = await createConsumer(router, {
  kafka: new Kafka({
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
  consumerConfig: {
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxBytesPerPartition: 1048576,
  },
});
```

## Error Handling

Handle errors during message processing:

```typescript
import { ProcessingError } from "@alt-stack/kafka";

const consumer = await createConsumer(router, {
  kafka: new Kafka({
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
  onError: (error) => {
    if (error instanceof ProcessingError) {
      // Handle processing errors
      console.error("Processing error:", error.code, error.data);
    } else {
      // Handle other errors
      console.error("Consumer error:", error);
    }
    // Implement retry logic or alerting
  },
});
```

Note: The consumer automatically connects and starts consuming messages when created. No manual `connect()` or `run()` calls are needed.

