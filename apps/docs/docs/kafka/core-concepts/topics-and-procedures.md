# Topics and Procedures

Define Kafka topics with type-safe message schemas using `kafkaRouter`.

## Basic Topic Definition

```typescript
import { init, kafkaRouter } from "@alt-stack/kafka-core";
import { z } from "zod";

const { procedure } = init();

const router = kafkaRouter({
  "user-events": procedure
    .input({
      message: z.object({
        userId: z.string(),
        eventType: z.string(),
      }),
    })
    .subscribe(({ input }) => {
      // input is the validated message
      console.log(input.userId);
    }),
});
```

## Message Validation

Messages are validated before the handler runs:

```typescript
const router = kafkaRouter({
  orders: procedure
    .input({
      message: z.object({
        orderId: z.string().uuid(),
        amount: z.number().positive(),
        currency: z.string().length(3),
      }),
    })
    .subscribe(({ input }) => {
      // Only called if message passes validation
      processOrder(input);
    }),
});
```

## Multiple Topics

```typescript
const router = kafkaRouter({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(({ input }) => handleUserEvent(input)),

  "order-events": procedure
    .input({ message: OrderEventSchema })
    .subscribe(({ input }) => handleOrderEvent(input)),
});
```

## Output Validation

Optionally validate handler return values:

```typescript
const router = kafkaRouter({
  "process-data": procedure
    .input({
      message: z.object({ data: z.string() }),
    })
    .output(
      z.object({
        processed: z.boolean(),
        result: z.string(),
      })
    )
    .subscribe(({ input }) => ({
      processed: true,
      result: input.data.toUpperCase(),
    })),
});
```

## subscribe vs handler

- `.subscribe()` - Use in `kafkaRouter({})` config (topic determined by key)
- `.handler()` - Creates a pending procedure for manual registration

```typescript
// Using subscribe (recommended)
const router = kafkaRouter({
  "my-topic": procedure.input({ message: Schema }).subscribe(({ input }) => {}),
});

// Using handler for manual registration
const pendingProc = procedure.input({ message: Schema }).handler(({ input }) => {});
const router = createKafkaRouter();
router.registerPendingProcedure("my-topic", pendingProc);
```
