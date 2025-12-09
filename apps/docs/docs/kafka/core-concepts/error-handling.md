# Error Handling

Define typed error schemas using the Result pattern.

## Error Schemas

```typescript
import { init, kafkaRouter, ok, err } from "@alt-stack/kafka-core";
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
    .subscribe(({ input }) => {
      if (!isValidOrder(input.orderId)) {
        return err({
          data: {
            error: {
              code: "INVALID_ORDER" as const,
              message: "Order not found",
              orderId: input.orderId,
            },
          },
        });
      }

      const available = getAvailableFunds();
      if (input.amount > available) {
        return err({
          data: {
            error: {
              code: "INSUFFICIENT_FUNDS" as const,
              message: "Insufficient funds",
              required: input.amount,
              available,
            },
          },
        });
      }

      processOrder(input);
      return ok();
    }),
});
```

## Consumer Error Handling

```typescript
import { createConsumer, ProcessingError } from "@alt-stack/kafka-core";

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

## Result Pattern

Handlers return `Result<Errors, Output>`:

```typescript
import { ok, err, isOk, isErr } from "@alt-stack/kafka-core";

// Success
return ok({ processed: true });

// Success with void
return ok();

// Error
return err({
  data: {
    error: { code: "FAILED" as const, message: "Processing failed" },
  },
});
```

## Error Types

The library exports:

- `KafkaError` - Base error class with `code`, `message`, and optional `details`
- `ValidationError` - Schema validation failures
- `ProcessingError` - Handler execution errors
