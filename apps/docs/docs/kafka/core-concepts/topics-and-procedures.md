# Topics and Procedures

Define Kafka topics and their message handlers with type-safe procedures.

## Basic Topic Definition

Use the `topic` method to define a Kafka topic and its message schema:

```typescript
import { createKafkaRouter } from "@alt-stack/kafka";
import { z } from "zod";

const router = createKafkaRouter()
  .topic("user-events", {
    input: {
      message: z.object({
        userId: z.string(),
        eventType: z.string(),
      }),
    },
  })
  .handler((ctx) => {
    // ctx.input is typed based on the schema (not ctx.input.message)
    console.log(ctx.input.userId);
  });
```

## Message Validation

Messages are automatically validated against the schema before the handler is called:

```typescript
const router = createKafkaRouter()
  .topic("orders", {
    input: {
      message: z.object({
        orderId: z.string().uuid(),
        amount: z.number().positive(),
        currency: z.string().length(3),
      }),
    },
  })
  .handler((ctx) => {
    // Only called if message matches schema
    // ctx.input is the parsed message (not ctx.input.message)
    processOrder(ctx.input);
  });
```

## Multiple Topics

Define multiple topics in a single router:

```typescript
const router = createKafkaRouter()
  .topic("user-events", {
    input: {
      message: UserEventSchema,
    },
  })
  .handler(handleUserEvent)
  .topic("order-events", {
    input: {
      message: OrderEventSchema,
    },
  })
  .handler(handleOrderEvent);
```

## Output Validation

Optionally validate handler output:

```typescript
const router = createKafkaRouter()
  .topic("process-data", {
    input: {
      message: z.object({
        data: z.string(),
      }),
    },
    output: z.object({
      processed: z.boolean(),
      result: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.input is the parsed message
    return {
      processed: true,
      result: ctx.input.data.toUpperCase(),
    };
  });
```

