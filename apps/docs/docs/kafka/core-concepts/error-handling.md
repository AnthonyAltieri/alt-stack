# Error Handling

Handle errors in Kafka message processing with typed error schemas.

## Error Schemas

Define error schemas for your procedures:

```typescript
import { createKafkaRouter } from "@alt-stack/kafka";
import { z } from "zod";

const router = createKafkaRouter()
  .topic("process-order", {
    input: {
      message: z.object({
        orderId: z.string(),
        amount: z.number(),
      }),
    },
    errors: {
      INVALID_ORDER: z.object({
        error: z.object({
          code: z.literal("INVALID_ORDER"),
          message: z.string(),
          orderId: z.string(),
        }),
      }),
      INSUFFICIENT_FUNDS: z.object({
        error: z.object({
          code: z.literal("INSUFFICIENT_FUNDS"),
          message: z.string(),
          required: z.number(),
          available: z.number(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    if (!isValidOrder(ctx.input.orderId)) {
      throw ctx.error({
        error: {
          code: "INVALID_ORDER",
          message: "Order not found",
          orderId: ctx.input.orderId,
        },
      });
    }
    
    if (ctx.input.amount > getAvailableFunds()) {
      throw ctx.error({
        error: {
          code: "INSUFFICIENT_FUNDS",
          message: "Insufficient funds",
          required: ctx.input.amount,
          available: getAvailableFunds(),
        },
      });
    }
    
    processOrder(ctx.input);
  });
```

## Error Types

The `ctx.error()` method accepts a union of all error schemas:

```typescript
// TypeScript knows the available error schemas
ctx.error({
  error: {
    code: "INVALID_ORDER",
    message: "Order not found",
    orderId: "123",
  },
});

// TypeScript validates the error data matches one of the schemas
ctx.error({
  error: {
    code: "INVALID_ORDER",
    message: "Order not found",
    orderId: "123",
    // extra: "field", // Error: Type error
  },
});
```

## Consumer Error Handling

Handle errors at the consumer level:

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
      sendToDeadLetterQueue(error);
    } else {
      // Handle other errors
      console.error("Unexpected error:", error);
    }
  },
});
```

## Processing Errors

Errors thrown in handlers are automatically caught and passed to `onError`:

```typescript
const router = createKafkaRouter()
  .topic("user-events", {
    input: {
      message: z.object({
        userId: z.string(),
      }),
    },
    errors: {
      USER_NOT_FOUND: z.object({
        error: z.object({
          code: z.literal("USER_NOT_FOUND"),
          userId: z.string(),
        }),
      }),
    },
  })
  .handler(async (ctx) => {
    const user = await db.findUser(ctx.input.userId);
    if (!user) {
      throw ctx.error({
        error: {
          code: "USER_NOT_FOUND",
          userId: ctx.input.userId,
        },
      });
    }
    // Process user...
  });
```

