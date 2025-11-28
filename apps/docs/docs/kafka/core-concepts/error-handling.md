# Error Handling

Define typed error schemas for structured error handling.

## Error Schemas

```typescript
import { init, kafkaRouter } from "@alt-stack/kafka";
import { z } from "zod";

const { procedure } = init();

const router = kafkaRouter({
  "process-order": procedure
    .input({
      message: z.object({
        orderId: z.string(),
        amount: z.number(),
      }),
    })
    .errors({
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
    })
    .subscribe(({ input, ctx }) => {
      if (!isValidOrder(input.orderId)) {
        throw ctx.error({
          error: {
            code: "INVALID_ORDER",
            message: "Order not found",
            orderId: input.orderId,
          },
        });
      }

      const available = getAvailableFunds();
      if (input.amount > available) {
        throw ctx.error({
          error: {
            code: "INSUFFICIENT_FUNDS",
            message: "Insufficient funds",
            required: input.amount,
            available,
          },
        });
      }

      processOrder(input);
    }),
});
```

## Consumer Error Handling

```typescript
import { createConsumer, ProcessingError } from "@alt-stack/kafka";

const consumer = await createConsumer(router, {
  kafka: new Kafka({ brokers: ["localhost:9092"] }),
  groupId: "my-group",
  onError: (error) => {
    if (error instanceof ProcessingError) {
      console.error("Processing error:", error.code, error.details);
      sendToDeadLetterQueue(error);
    } else {
      console.error("Unexpected error:", error);
    }
  },
});
```

## Error Types

The library exports:

- `KafkaError` - Base error class with `code`, `message`, and optional `details`
- `ValidationError` - Schema validation failures
- `ProcessingError` - Handler execution errors
